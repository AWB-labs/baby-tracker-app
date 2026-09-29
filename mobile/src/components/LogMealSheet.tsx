import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../design/ThemeProvider";
import { space, radius, PRESSED_OPACITY } from "../design/tokens";
import { Icon } from "../design/icons";
import {
  Text,
  Emoji,
  Button,
  Input,
  Field,
  Sheet,
  Chip,
  ChipWrap,
} from "./ui";
import TimeField from "./TimeField";
import { useToast } from "./Toast";
import {
  createMeal,
  type FoodItem,
  type FoodLog,
  type FoodReaction,
  type FoodCategory,
} from "../api/foods";
import {
  FOOD_SUGGESTIONS,
  REACTION_ORDER,
  REACTION_META,
  ALLERGY_REACTIONS,
  foodEmoji,
  type FoodSuggestion,
} from "../lib/foods";

/** A food picked into the meal being built — existing catalogue entry or new. */
export interface SelectedFood {
  key: string;
  foodItemId?: number;
  name: string;
  emoji: string;
  category?: FoodCategory | null;
  /** Suggestion flagged as a common allergen, and not tried before. */
  allergenHint: boolean;
  rating: number | null;
  reaction: FoodReaction;
  reactionNote: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  babyId: number;
  enteredByName: string;
  /** The baby's catalogue, for "recent" picks and to know what's been tried. */
  catalog: FoodItem[];
  /** Pre-fill the meal (e.g. tapping a "try next" suggestion). */
  initialSelection?: SelectedFood[];
  onSaved: (logs: FoodLog[]) => void;
}

const RECENT_LIMIT = 12;
const SUGGEST_LIMIT = 10;

function keyFor(item: { foodItemId?: number; name: string }): string {
  return item.foodItemId != null ? `id:${item.foodItemId}` : `new:${item.name.toLowerCase()}`;
}

export function fromCatalog(item: FoodItem): SelectedFood {
  return {
    key: `id:${item.id}`,
    foodItemId: item.id,
    name: item.name,
    emoji: foodEmoji(item.name, item.emoji),
    category: item.category,
    allergenHint: false,
    rating: null,
    reaction: "none",
    reactionNote: "",
  };
}

export function fromSuggestion(s: FoodSuggestion): SelectedFood {
  return {
    key: `new:${s.name.toLowerCase()}`,
    name: s.name,
    emoji: s.emoji,
    category: s.category,
    allergenHint: !!s.allergen,
    rating: null,
    reaction: "none",
    reactionNote: "",
  };
}

/**
 * Log a meal in one sheet: pick what was eaten (from what's been tried, from
 * suggested first foods, or by typing something new), say how it went per
 * food — stars and any reaction — and when. Several foods save as one meal,
 * so "carrot + potato at lunch" is a single entry, not two.
 */
export default function LogMealSheet({
  visible,
  onClose,
  babyId,
  enteredByName,
  catalog,
  initialSelection,
  onSaved,
}: Props) {
  const t = useTheme();
  const toast = useToast();

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SelectedFood[]>([]);
  const [eatenAt, setEatenAt] = useState(new Date());
  const [saving, setSaving] = useState(false);

  // Reset on every open — a meal is a fresh thought each time.
  useEffect(() => {
    if (visible) {
      setQuery("");
      setSelected(initialSelection ?? []);
      setEatenAt(new Date());
    }
  }, [visible, initialSelection]);

  const triedNames = useMemo(
    () => new Set(catalog.map((c) => c.name.toLowerCase())),
    [catalog]
  );
  const selectedKeys = useMemo(() => new Set(selected.map((s) => s.key)), [selected]);

  const q = query.trim().toLowerCase();

  /** Catalogue first (already tried), then suggestions not yet tried. */
  const options = useMemo(() => {
    const recent = [...catalog]
      .sort(
        (a, b) =>
          new Date(b.lastEatenAt ?? b.createdAt).getTime() -
          new Date(a.lastEatenAt ?? a.createdAt).getTime()
      )
      .map(fromCatalog);
    const fresh = FOOD_SUGGESTIONS.filter(
      (s) => !triedNames.has(s.name.toLowerCase())
    ).map(fromSuggestion);

    if (!q) {
      return {
        recent: recent.slice(0, RECENT_LIMIT),
        fresh: fresh.slice(0, SUGGEST_LIMIT),
        exact: true,
      };
    }
    const match = (s: SelectedFood) => s.name.toLowerCase().includes(q);
    const exact =
      recent.some((s) => s.name.toLowerCase() === q) ||
      fresh.some((s) => s.name.toLowerCase() === q);
    return { recent: recent.filter(match), fresh: fresh.filter(match), exact };
  }, [catalog, triedNames, q]);

  const toggle = (food: SelectedFood) => {
    setSelected((prev) =>
      prev.some((s) => s.key === food.key)
        ? prev.filter((s) => s.key !== food.key)
        : [...prev, food]
    );
    setQuery("");
  };

  const addTyped = () => {
    const name = query.trim();
    if (!name) return;
    const existing = catalog.find((c) => c.name.toLowerCase() === name.toLowerCase());
    toggle(
      existing
        ? fromCatalog(existing)
        : {
            key: keyFor({ name }),
            name: name.charAt(0).toUpperCase() + name.slice(1),
            emoji: foodEmoji(name),
            category: null,
            allergenHint: false,
            rating: null,
            reaction: "none",
            reactionNote: "",
          }
    );
  };

  const patch = (key: string, changes: Partial<SelectedFood>) =>
    setSelected((prev) => prev.map((s) => (s.key === key ? { ...s, ...changes } : s)));

  const handleSave = async () => {
    if (selected.length === 0 || saving) return;
    setSaving(true);
    try {
      const logs = await createMeal({
        babyId,
        eatenAt,
        enteredByName,
        items: selected.map((s) => ({
          ...(s.foodItemId != null ? { foodItemId: s.foodItemId } : { name: s.name }),
          emoji: s.emoji,
          category: s.category ?? null,
          rating: s.rating,
          reaction: s.reaction,
          reactionNote: s.reaction === "none" ? null : s.reactionNote.trim() || null,
        })),
      });
      const reacted = selected.filter((s) => ALLERGY_REACTIONS.has(s.reaction));
      toast.success(
        reacted.length > 0
          ? `Meal saved. ${reacted.map((r) => r.name).join(", ")} flagged to watch.`
          : `Meal saved: ${selected.map((s) => s.name).join(" + ")}.`
      );
      onSaved(logs);
      onClose();
    } catch (err) {
      toast.showError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Log a meal"
      subtitle="What she ate, how it went, and when."
      footer={
        <View style={styles.footer}>
          <Button label="Cancel" variant="ghost" onPress={onClose} style={styles.flex} />
          <Button
            label={selected.length > 1 ? `Save ${selected.length} foods` : "Save meal"}
            variant="primary"
            loading={saving}
            disabled={selected.length === 0}
            onPress={handleSave}
            style={styles.flex}
          />
        </View>
      }
    >
      <View style={styles.form}>
        {/* What was eaten — the meal being built sits above the picker so it
            never scrolls out of view while more is added. */}
        {selected.length > 0 && (
          <ChipWrap>
            {selected.map((s) => (
              <Chip
                key={s.key}
                label={s.name}
                emoji={s.emoji}
                selected
                onPress={() => toggle(s)}
              />
            ))}
          </ChipWrap>
        )}

        <Input
          label={selected.length === 0 ? "What did she eat?" : "Add another"}
          value={query}
          onChangeText={setQuery}
          placeholder="Carrot, banana, egg…"
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={addTyped}
        />

        {q.length > 0 && !options.exact && (
          <Pressable
            onPress={addTyped}
            accessibilityRole="button"
            accessibilityLabel={`Add ${query.trim()} as a new food`}
            style={({ pressed }) => [
              styles.addRow,
              {
                backgroundColor: t.accentSofter,
                borderColor: t.borderStrong,
                opacity: pressed ? PRESSED_OPACITY : 1,
              },
            ]}
          >
            <Icon name="plus" size="sm" color={t.accentText} />
            <Text variant="subheadStrong" tone="accent">
              Add “{query.trim()}”
            </Text>
          </Pressable>
        )}

        {options.recent.length > 0 && (
          <Field label={q ? "Tried before" : "Tried before · most recent first"}>
            <ChipWrap>
              {options.recent.map((s) => (
                <Chip
                  key={s.key}
                  label={s.name}
                  emoji={s.emoji}
                  selected={selectedKeys.has(s.key)}
                  onPress={() => toggle(s)}
                />
              ))}
            </ChipWrap>
          </Field>
        )}

        {options.fresh.length > 0 && (
          <Field
            label={q ? "New to her" : "Try next"}
            helper={q ? undefined : "First foods she hasn't had yet. ⚠️ marks a common allergen — offer it alone, earlier in the day."}
          >
            <ChipWrap>
              {options.fresh.map((s) => (
                <Chip
                  key={s.key}
                  label={s.allergenHint ? `${s.name} ⚠️` : s.name}
                  emoji={s.emoji}
                  selected={selectedKeys.has(s.key)}
                  onPress={() => toggle(s)}
                />
              ))}
            </ChipWrap>
          </Field>
        )}

        {/* How it went — one card per food, so a reaction attaches to the
            right thing when carrot and egg went in together. */}
        {selected.map((s) => (
          <View
            key={s.key}
            style={[styles.foodCard, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}
          >
            <View style={styles.foodHeader}>
              <Emoji size={20}>{s.emoji}</Emoji>
              <Text variant="bodyStrong" style={styles.flex} numberOfLines={1}>
                {s.name}
              </Text>
              {s.allergenHint && (
                <Text variant="caption" style={{ color: t.warning }}>
                  common allergen
                </Text>
              )}
            </View>

            <StarRow
              value={s.rating}
              onChange={(rating) => patch(s.key, { rating })}
              label={`How much did she like ${s.name}`}
            />

            <ChipWrap>
              {REACTION_ORDER.map((r) => (
                <Chip
                  key={r}
                  label={REACTION_META[r].label}
                  emoji={REACTION_META[r].emoji}
                  selected={s.reaction === r}
                  onPress={() => patch(s.key, { reaction: r })}
                />
              ))}
            </ChipWrap>

            {s.reaction !== "none" && (
              <Input
                label="What happened?"
                value={s.reactionNote}
                onChangeText={(reactionNote) => patch(s.key, { reactionNote })}
                placeholder="Small rash on the cheeks after ~20 min…"
                returnKeyType="done"
              />
            )}
            {ALLERGY_REACTIONS.has(s.reaction) && (
              <Text variant="footnote" style={{ color: t.warning }}>
                {s.name} will be flagged to watch. Swelling or any trouble
                breathing needs urgent medical help.
              </Text>
            )}
          </View>
        ))}

        {selected.length > 0 && (
          <TimeField label="Eaten at" value={eatenAt} onChange={setEatenAt} />
        )}
      </View>
    </Sheet>
  );
}

/** Five tappable stars. Tapping the current value clears it. */
export function StarRow({
  value,
  onChange,
  label,
  size = 28,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  label: string;
  size?: number;
}) {
  const t = useTheme();
  return (
    <View
      style={styles.stars}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: value ? `${value} of 5 stars` : "not rated" }}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value != null && n <= value;
        return (
          <Pressable
            key={n}
            onPress={() => onChange(value === n ? null : n)}
            hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
            accessibilityRole="button"
            accessibilityLabel={`${n} star${n === 1 ? "" : "s"}`}
            style={({ pressed }) => ({ opacity: pressed ? PRESSED_OPACITY : 1 })}
          >
            <Text style={{ fontSize: size, lineHeight: size + 6, color: on ? t.warning : t.border }}>
              {on ? "★" : "☆"}
            </Text>
          </Pressable>
        );
      })}
      <Text variant="caption" tone="subtle" style={styles.starHint}>
        {value == null
          ? "Tap to rate"
          : ["", "Refused", "Not keen", "Ate some", "Liked it", "Loved it"][value]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  form: { gap: space.lg },
  footer: { flexDirection: "row", gap: space.sm },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  foodCard: {
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  foodHeader: { flexDirection: "row", alignItems: "center", gap: space.sm },
  stars: { flexDirection: "row", alignItems: "center", gap: space.xxs },
  starHint: { marginLeft: space.sm },
});
