import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../design/ThemeProvider";
import { space, radius, PRESSED_OPACITY } from "../design/tokens";
import { Icon } from "../design/icons";
import {
  Text,
  Emoji,
  SectionHeader,
  Card,
  Button,
  Input,
  Field,
  Sheet,
  Chip,
  ChipRow,
  ChipWrap,
  Segmented,
} from "./ui";
import {
  loadFoods,
  saveFoods,
  effectiveFoods,
  emptyStatus,
  OPINION_META,
  REACTION_ORDER,
  REACTION_META,
  type FoodsState,
  type FoodDef,
  type FoodStatus,
  type FoodOpinion,
  type FoodReaction,
  type FoodCategory,
} from "../lib/foods";

type Filter = "all" | "totry" | "tried" | "reacted" | "allergen";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "totry", label: "To try" },
  { value: "tried", label: "Tried" },
  { value: "reacted", label: "Reacted" },
  { value: "allergen", label: "Allergens" },
];

const OPINIONS: FoodOpinion[] = ["liked", "neutral", "disliked"];

const NEW_CATEGORIES: { value: FoodCategory; label: string }[] = [
  { value: "first", label: "Iron" },
  { value: "veg", label: "Veg" },
  { value: "fruit", label: "Fruit" },
  { value: "grain", label: "Grain" },
];

interface Props {
  babyId: number;
}

/**
 * A dedicated solids tracker: a shared checklist of what the baby has tried,
 * which allergens have been offered, and — the reason it earns its own section
 * rather than a habit tile — whether a food disagreed with them and how (gas,
 * a rash, vomiting…). Everything is per-baby on the device; nothing is sent to
 * the server, so it changes no existing data.
 */
export default function Foods({ babyId }: Props) {
  const t = useTheme();

  const [state, setState] = useState<FoodsState>({
    statuses: {},
    custom: [],
    removed: [],
  });
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("");
  const [newCat, setNewCat] = useState<FoodCategory>("veg");

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    loadFoods(babyId).then((s) => {
      if (alive) {
        setState(s);
        setLoaded(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [babyId]);

  const persist = useCallback(
    (next: FoodsState) => {
      setState(next);
      saveFoods(babyId, next);
    },
    [babyId]
  );

  const foods = useMemo(() => effectiveFoods(state), [state]);
  const statusOf = useCallback(
    (id: string): FoodStatus => state.statuses[id] ?? emptyStatus(),
    [state.statuses]
  );

  const patchStatus = useCallback(
    (id: string, patch: Partial<FoodStatus>) => {
      const cur = state.statuses[id] ?? emptyStatus();
      persist({
        ...state,
        statuses: { ...state.statuses, [id]: { ...cur, ...patch } },
      });
    },
    [state, persist]
  );

  const setTried = useCallback(
    (id: string, tried: boolean) => {
      const cur = state.statuses[id] ?? emptyStatus();
      patchStatus(id, {
        tried,
        triedDate: tried ? cur.triedDate ?? new Date().toISOString() : cur.triedDate,
      });
    },
    [state.statuses, patchStatus]
  );

  const toggleReaction = useCallback(
    (id: string, reaction: FoodReaction) => {
      const cur = state.statuses[id] ?? emptyStatus();
      const has = cur.reactions.includes(reaction);
      patchStatus(id, {
        reactions: has
          ? cur.reactions.filter((r) => r !== reaction)
          : [...cur.reactions, reaction],
      });
    },
    [state.statuses, patchStatus]
  );

  const removeFood = useCallback(
    (food: FoodDef) => {
      const nextStatuses = { ...state.statuses };
      delete nextStatuses[food.id];
      persist({
        statuses: nextStatuses,
        custom: food.custom
          ? state.custom.filter((f) => f.id !== food.id)
          : state.custom,
        removed: food.custom ? state.removed : [...state.removed, food.id],
      });
      setSelectedId(null);
    },
    [state, persist]
  );

  const addFood = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    const id = `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${state.custom.length}`;
    const def: FoodDef = {
      id,
      name,
      emoji: newEmoji.trim() || "🍽️",
      category: newCat,
      custom: true,
    };
    persist({ ...state, custom: [...state.custom, def] });
    setNewName("");
    setNewEmoji("");
    setNewCat("veg");
    setShowAdd(false);
  }, [newName, newEmoji, newCat, state, persist]);

  const counts = useMemo(() => {
    let tried = 0;
    let reacted = 0;
    let allergensTried = 0;
    let allergensTotal = 0;
    for (const f of foods) {
      const s = statusOf(f.id);
      if (s.tried) tried += 1;
      if (s.reactions.length > 0) reacted += 1;
      if (f.allergen) {
        allergensTotal += 1;
        if (s.tried) allergensTried += 1;
      }
    }
    return { tried, reacted, allergensTried, allergensTotal, total: foods.length };
  }, [foods, statusOf]);

  const filtered = useMemo(() => {
    return foods.filter((f) => {
      const s = statusOf(f.id);
      switch (filter) {
        case "totry":
          return !s.tried;
        case "tried":
          return s.tried;
        case "reacted":
          return s.reactions.length > 0;
        case "allergen":
          return !!f.allergen;
        default:
          return true;
      }
    });
  }, [foods, filter, statusOf]);

  const selected = selectedId
    ? foods.find((f) => f.id === selectedId) ?? null
    : null;
  const selStatus = selectedId ? statusOf(selectedId) : null;

  if (!loaded) return null;

  return (
    <View style={styles.section}>
      <SectionHeader
        title="Foods"
        action={
          <Pressable
            onPress={() => setShowAdd(true)}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Add a food"
          >
            <Text variant="subheadStrong" tone="accent">
              ＋ Add
            </Text>
          </Pressable>
        }
      />

      {/* Progress + the guidance that matters most when starting solids. */}
      <Card>
        <View style={styles.progressRow}>
          <Stat value={`${counts.tried}/${counts.total}`} label="tried" />
          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <Stat
            value={`${counts.allergensTried}/${counts.allergensTotal}`}
            label="allergens"
          />
          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <Stat
            value={`${counts.reacted}`}
            label="reacted"
            tone={counts.reacted > 0 ? t.warning : undefined}
          />
        </View>
        <Text variant="footnote" tone="subtle">
          One new food at a time, earlier in the day, and watch for a reaction —
          offer the Big 9 allergens early and often once each is tolerated.
        </Text>
      </Card>

      <ChipRow>
        {FILTERS.map((f) => (
          <Chip
            key={f.value}
            label={f.label}
            selected={filter === f.value}
            onPress={() => setFilter(f.value)}
          />
        ))}
      </ChipRow>

      {filtered.length === 0 ? (
        <Text variant="subhead" tone="subtle" style={styles.emptyLine}>
          Nothing here yet.
        </Text>
      ) : (
        <ChipWrap>
          {filtered.map((food) => {
            const s = statusOf(food.id);
            const reacted = s.reactions.length > 0;
            const bg = reacted
              ? t.warningSoft
              : s.tried
                ? t.successSoft
                : t.accentSofter;
            const border = reacted
              ? t.warningBorder
              : s.tried
                ? t.successBorder
                : food.allergen
                  ? t.accent
                  : t.borderStrong;
            const fg = reacted ? t.warning : s.tried ? t.success : t.text;
            return (
              <Pressable
                key={food.id}
                onPress={() => setSelectedId(food.id)}
                accessibilityRole="button"
                accessibilityLabel={`${food.name}${food.allergen ? ", allergen" : ""}, ${
                  reacted
                    ? "had a reaction"
                    : s.tried
                      ? "tried"
                      : "not tried yet"
                }`}
                style={({ pressed }) => [
                  styles.pill,
                  { backgroundColor: bg, borderColor: border, opacity: pressed ? PRESSED_OPACITY : 1 },
                ]}
              >
                <Emoji size={16}>{food.emoji}</Emoji>
                <Text variant="subheadStrong" style={{ color: fg }} numberOfLines={1}>
                  {food.name}
                </Text>
                {reacted ? (
                  <Emoji size={12}>⚠️</Emoji>
                ) : s.tried ? (
                  <Icon name="check" size="xs" color={t.success} strokeWidth={3} />
                ) : food.allergen ? (
                  <View style={[styles.allergenDot, { backgroundColor: t.accent }]} />
                ) : null}
              </Pressable>
            );
          })}
        </ChipWrap>
      )}

      {/* ---------------------------------------------------- food detail */}
      <Sheet
        visible={selected != null}
        onClose={() => setSelectedId(null)}
        title={selected ? `${selected.emoji}  ${selected.name}` : ""}
        subtitle={
          selected?.allergen
            ? "Common allergen — introduce early, on its own, and watch closely."
            : undefined
        }
        footer={
          <Button
            label="Done"
            variant="primary"
            fullWidth
            onPress={() => setSelectedId(null)}
          />
        }
      >
        {selected && selStatus ? (
          <View style={styles.detail}>
            <Field label="Have they tried it?">
              <Segmented
                options={[
                  { value: "no", label: "Not yet" },
                  { value: "yes", label: "Tried" },
                ]}
                value={selStatus.tried ? "yes" : "no"}
                onChange={(v) => setTried(selected.id, v === "yes")}
              />
            </Field>

            {selStatus.tried ? (
              <>
                {selStatus.triedDate ? (
                  <Text variant="footnote" tone="subtle">
                    First tried{" "}
                    {new Date(selStatus.triedDate).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Text>
                ) : null}

                <Field label="How did it go?">
                  <Segmented
                    options={OPINIONS.map((o) => ({
                      value: o,
                      label: OPINION_META[o].label,
                    }))}
                    value={selStatus.opinion ?? "neutral"}
                    onChange={(v) =>
                      patchStatus(selected.id, { opinion: v as FoodOpinion })
                    }
                  />
                </Field>

                <View style={styles.reactionBlock}>
                  <Text variant="subheadStrong">Any reaction?</Text>
                  <Text variant="footnote" tone="subtle">
                    Tap anything you noticed. Swelling or trouble breathing needs
                    urgent medical help.
                  </Text>
                  <ChipWrap>
                    {REACTION_ORDER.map((r) => (
                      <Chip
                        key={r}
                        label={REACTION_META[r].label}
                        emoji={REACTION_META[r].emoji}
                        selected={selStatus.reactions.includes(r)}
                        onPress={() => toggleReaction(selected.id, r)}
                      />
                    ))}
                  </ChipWrap>
                </View>

                <Input
                  label="Notes"
                  value={selStatus.notes ?? ""}
                  onChangeText={(text) =>
                    patchStatus(selected.id, { notes: text })
                  }
                  placeholder="How much, how prepared, anything to remember…"
                  returnKeyType="done"
                />
              </>
            ) : null}

            <Button
              label="Remove from list"
              icon="trash"
              variant="ghost"
              fullWidth
              onPress={() => removeFood(selected)}
            />
          </View>
        ) : null}
      </Sheet>

      {/* ------------------------------------------------------- add food */}
      <Sheet
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add a food"
        subtitle="It joins your checklist to try and track."
        footer={
          <Button
            label="Add food"
            variant="primary"
            fullWidth
            disabled={!newName.trim()}
            onPress={addFood}
          />
        }
      >
        <View style={styles.detail}>
          <Input
            label="Food"
            value={newName}
            onChangeText={setNewName}
            placeholder="e.g. Zucchini"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={addFood}
          />
          <Input
            label="Emoji (optional)"
            value={newEmoji}
            onChangeText={setNewEmoji}
            placeholder="🥒"
            maxLength={4}
          />
          <Field label="Group">
            <Segmented
              options={NEW_CATEGORIES}
              value={newCat === "allergen" ? "veg" : newCat}
              onChange={setNewCat}
            />
          </Field>
        </View>
      </Sheet>
    </View>
  );
}

function Stat({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone?: string;
}) {
  return (
    <View style={styles.stat}>
      <Text variant="title3" tabular style={tone ? { color: tone } : undefined}>
        {value}
      </Text>
      <Text variant="caption" tone="subtle">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.sm,
  },
  stat: { alignItems: "center", flex: 1, gap: space.xxs },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: "stretch" },
  emptyLine: { paddingVertical: space.md },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingLeft: space.md,
    paddingRight: space.md,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  allergenDot: { width: 7, height: 7, borderRadius: radius.pill },
  detail: { gap: space.lg },
  reactionBlock: { gap: space.xs },
});
