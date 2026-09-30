import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../design/ThemeProvider";
import { space, radius, PRESSED_OPACITY } from "../design/tokens";
import { Icon } from "../design/icons";
import {
  Screen,
  ScreenHeader,
  Card,
  Text,
  Emoji,
  Button,
  IconButton,
  EmptyState,
  Chip,
  ChipRow,
  ChipWrap,
  Sheet,
  SkeletonList,
  FadeInUp,
  ConfirmDialog,
} from "../components/ui";
import LogMealSheet, {
  fromSuggestion,
  type SelectedFood,
} from "../components/LogMealSheet";
import { useBaby } from "../context/BabyContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";
import {
  getFoods,
  getFoodLogs,
  updateFood,
  deleteFood,
  deleteFoodLog,
  type FoodItem,
  type FoodLog,
} from "../api/foods";
import {
  FOOD_SUGGESTIONS,
  REACTION_META,
  isReaction,
  starString,
  foodEmoji,
} from "../lib/foods";
import { formatRelativeTime, formatDateLabel, formatTime } from "../utils/formatTime";

type Filter = "all" | "loved" | "reacted" | "watch" | "next";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "loved", label: "Loved" },
  { value: "reacted", label: "Reacted" },
  { value: "watch", label: "To watch" },
  { value: "next", label: "Try next" },
];

/**
 * Every food she's tried, and what each one's history says. This is the
 * page a parent opens before a paediatrician appointment: what's been
 * offered, what she loved, what didn't agree with her, and what's still to
 * come. Tapping a food shows every serving of it.
 */
export default function FoodsScreen() {
  const t = useTheme();
  const toast = useToast();
  const navigation = useNavigation();
  const { activeBaby } = useBaby();
  const { account } = useAuth();
  const enteredByName = account?.name || "Unknown";

  const [items, setItems] = useState<FoodItem[]>([]);
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FoodItem | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [preselect, setPreselect] = useState<SelectedFood[] | undefined>(undefined);

  /*
   * Keyed on the baby's id, not the baby object or the toast handle: both of
   * those can change identity on unrelated re-renders, and a `load` that
   * changes identity re-runs the effect below — which flips the screen back
   * to its skeleton, fetches, and flips again. That was a visible flicker
   * between "empty" and "loaded" every time something upstream re-rendered.
   */
  const babyId = activeBaby?.id ?? null;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const load = useCallback(async () => {
    if (babyId == null) {
      setLoading(false);
      return;
    }
    try {
      const [foods, history] = await Promise.all([
        getFoods(babyId),
        getFoodLogs(babyId),
      ]);
      setItems(foods);
      setLogs(history);
    } catch (err) {
      toastRef.current.showError(err);
    } finally {
      setLoading(false);
    }
  }, [babyId]);

  // Skeleton only on first load for a baby; refreshes keep the list on screen.
  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const tried = useMemo(() => items.filter((i) => i.timesTried > 0), [items]);
  const stats = {
    tried: tried.length,
    loved: tried.filter((i) => (i.avgRating ?? 0) >= 4).length,
    reacted: tried.filter((i) => i.reactionCount > 0).length,
    watch: items.filter((i) => i.allergen).length,
  };

  const triedNames = useMemo(
    () => new Set(items.map((i) => i.name.toLowerCase())),
    [items]
  );
  const suggestions = useMemo(
    () => FOOD_SUGGESTIONS.filter((s) => !triedNames.has(s.name.toLowerCase())),
    [triedNames]
  );

  const visible = useMemo(() => {
    switch (filter) {
      case "loved":
        return tried.filter((i) => (i.avgRating ?? 0) >= 4);
      case "reacted":
        return tried.filter((i) => i.reactionCount > 0);
      case "watch":
        return items.filter((i) => i.allergen);
      default:
        return items;
    }
  }, [filter, items, tried]);

  const selected = selectedId != null ? items.find((i) => i.id === selectedId) ?? null : null;
  const selectedHistory = useMemo(
    () => (selectedId != null ? logs.filter((l) => l.foodItemId === selectedId) : []),
    [logs, selectedId]
  );

  const toggleAllergen = async (item: FoodItem) => {
    const next = !item.allergen;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, allergen: next } : i)));
    try {
      await updateFood(item.id, { allergen: next });
      toast.success(next ? `${item.name} flagged to watch.` : `${item.name} cleared.`);
    } catch (err) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, allergen: item.allergen } : i)));
      toast.showError(err);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setSelectedId(null);
    const prevItems = items;
    setItems((prev) => prev.filter((i) => i.id !== target.id));
    try {
      await deleteFood(target.id);
      toast.success(`${target.name} removed.`);
    } catch (err) {
      setItems(prevItems);
      toast.showError(err);
    }
  };

  const removeServing = async (log: FoodLog) => {
    const prevLogs = logs;
    setLogs((prev) => prev.filter((l) => l.id !== log.id));
    try {
      await deleteFoodLog(log.id);
      await load();
    } catch (err) {
      setLogs(prevLogs);
      toast.showError(err);
    }
  };

  const openLogWith = (pre?: SelectedFood[]) => {
    setPreselect(pre);
    setShowLog(true);
  };

  // "Log it again" from the history sheet: the logger can't be presented
  // until that sheet has actually finished closing (see Sheet.onClosed), so
  // the choice is parked here and picked up in onClosed.
  const [logAfterClose, setLogAfterClose] = useState<SelectedFood[] | null>(null);

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <View style={styles.headerRow}>
        <IconButton
          icon="chevronLeft"
          label="Back to Today"
          variant="surface"
          onPress={() => navigation.goBack()}
        />
        <ScreenHeader
          title={activeBaby ? `${activeBaby.name}'s foods` : "Foods"}
          subtitle={
            stats.tried === 0
              ? "Every first taste, and how it went"
              : `${stats.tried} tried · ${stats.loved} loved${
                  stats.watch > 0 ? ` · ${stats.watch} to watch` : ""
                }`
          }
          style={styles.headerText}
        />
        <IconButton
          icon="plus"
          label="Log a meal"
          variant="accent"
          onPress={() => openLogWith(undefined)}
        />
      </View>

      <Card>
        <View style={styles.statRow}>
          <Stat value={stats.tried} label="tried" />
          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <Stat value={stats.loved} label="loved" tone={t.success} />
          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <Stat value={stats.reacted} label="reacted" tone={stats.reacted > 0 ? t.warning : undefined} />
          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <Stat value={stats.watch} label="to watch" tone={stats.watch > 0 ? t.danger : undefined} />
        </View>
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

      {loading ? (
        <SkeletonList rows={5} />
      ) : filter === "next" ? (
        <View style={styles.list}>
          <Text variant="footnote" tone="subtle">
            First foods she hasn't had yet, in the order guidance suggests. ⚠️
            marks a common allergen — offer it alone, earlier in the day, and
            watch for a reaction. Tap one to log it.
          </Text>
          <ChipWrap>
            {suggestions.map((s) => (
              <Chip
                key={s.name}
                label={s.allergen ? `${s.name} ⚠️` : s.name}
                emoji={s.emoji}
                onPress={() => openLogWith([fromSuggestion(s)])}
              />
            ))}
          </ChipWrap>
        </View>
      ) : visible.length === 0 ? (
        <EmptyState
          icon="sparkles"
          title={items.length === 0 ? "No foods yet" : "Nothing here"}
          body={
            items.length === 0
              ? "Log her first taste and it lands here with every serving that follows."
              : "Nothing matches this filter yet."
          }
        />
      ) : (
        <View style={styles.list}>
          {visible.map((item, index) => (
            <FadeInUp key={item.id} index={index}>
              <Pressable
                onPress={() => setSelectedId(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${
                  item.timesTried === 0
                    ? "not tried yet"
                    : `tried ${item.timesTried} time${item.timesTried === 1 ? "" : "s"}`
                }${item.avgRating != null ? `, rated ${item.avgRating.toFixed(1)} of 5` : ""}${
                  item.allergen ? ", flagged to watch" : ""
                }. Shows its history.`}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: t.surface,
                    borderColor: item.allergen ? t.dangerBorder : t.border,
                    opacity: pressed ? PRESSED_OPACITY : 1,
                  },
                ]}
              >
                <View style={[styles.avatar, { backgroundColor: item.allergen ? t.dangerSoft : t.accentSofter }]}>
                  <Emoji size={20}>{foodEmoji(item.name, item.emoji)}</Emoji>
                </View>
                <View style={styles.rowBody}>
                  <View style={styles.nameRow}>
                    <Text variant="bodyStrong" numberOfLines={1} style={styles.flexShrink}>
                      {item.name}
                    </Text>
                    {item.allergen && (
                      <View style={[styles.pill, { backgroundColor: t.dangerSoft }]}>
                        <Text variant="caption" style={{ color: t.danger }}>
                          watch
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text variant="caption" tone="subtle" numberOfLines={1}>
                    {item.timesTried === 0
                      ? "Not tried yet"
                      : [
                          `${item.timesTried}×`,
                          item.lastEatenAt ? `last ${formatRelativeTime(item.lastEatenAt)}` : null,
                          item.lastReaction ? REACTION_META[item.lastReaction].label.toLowerCase() : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                  </Text>
                </View>
                {item.avgRating != null ? (
                  <Text variant="caption" style={{ color: t.warning }}>
                    {starString(item.avgRating)}
                  </Text>
                ) : (
                  <Icon name="chevronRight" size="sm" color={t.textSubtle} />
                )}
              </Pressable>
            </FadeInUp>
          ))}
        </View>
      )}

      <Button label="Log a meal" icon="plus" variant="primary" fullWidth onPress={() => openLogWith(undefined)} />

      {/* ------------------------------------------------- food history */}
      <Sheet
        visible={selected != null}
        onClose={() => setSelectedId(null)}
        onClosed={() => {
          if (!logAfterClose) return;
          const pre = logAfterClose;
          setLogAfterClose(null);
          openLogWith(pre);
        }}
        title={selected ? `${foodEmoji(selected.name, selected.emoji)}  ${selected.name}` : ""}
        subtitle={
          selected
            ? selected.timesTried === 0
              ? "Not tried yet"
              : `First tried ${selected.firstEatenAt ? formatDateLabel(selected.firstEatenAt) : "—"} · ${
                  selected.timesTried
                } serving${selected.timesTried === 1 ? "" : "s"}`
            : undefined
        }
        footer={
          selected ? (
            <View style={styles.sheetFooter}>
              <Button
                label="Remove"
                variant="ghost"
                onPress={() => setPendingDelete(selected)}
                style={styles.flex}
              />
              <Button
                label="Log it again"
                variant="primary"
                onPress={() => {
                  setLogAfterClose([
                    {
                      key: `id:${selected.id}`,
                      foodItemId: selected.id,
                      name: selected.name,
                      emoji: foodEmoji(selected.name, selected.emoji),
                      category: selected.category,
                      allergenHint: false,
                      rating: null,
                      reaction: "none",
                      reactionNote: "",
                    },
                  ]);
                  setSelectedId(null);
                }}
                style={styles.flex}
              />
            </View>
          ) : undefined
        }
      >
        {selected ? (
          <View style={styles.detail}>
            {/* A pressable tick rather than a native Switch: inside this
                sheet's Modal the Switch swallowed its taps on iOS, and the
                diaper-stock tick is already the app's idiom for one-bit
                choices in a sheet. The whole row is the target. */}
            <Pressable
              onPress={() => toggleAllergen(selected)}
              accessibilityRole="switch"
              accessibilityState={{ checked: selected.allergen }}
              accessibilityLabel={`Flag ${selected.name} to watch`}
              style={({ pressed }) => [
                styles.switchRow,
                { borderColor: t.border, opacity: pressed ? PRESSED_OPACITY : 1 },
              ]}
            >
              <View style={styles.rowBody}>
                <Text variant="subheadStrong">Flag to watch</Text>
                <Text variant="caption" tone="subtle">
                  Set automatically after a rash, hives, vomiting or swelling. Clear it once a doctor says it's fine.
                </Text>
              </View>
              <View
                style={[
                  styles.flagPill,
                  {
                    backgroundColor: selected.allergen ? t.danger : "transparent",
                    borderColor: selected.allergen ? t.danger : t.borderStrong,
                  },
                ]}
              >
                {selected.allergen && (
                  <Icon name="check" size="xs" color={t.textInverse} strokeWidth={3} />
                )}
                <Text
                  variant="caption"
                  style={{ color: selected.allergen ? t.textInverse : t.textSubtle }}
                >
                  {selected.allergen ? "Watching" : "Off"}
                </Text>
              </View>
            </Pressable>

            {selectedHistory.length === 0 ? (
              <Text variant="subhead" tone="subtle">
                No servings logged yet.
              </Text>
            ) : (
              <View style={styles.history}>
                {selectedHistory.map((log, index) => (
                  <View
                    key={log.id}
                    style={[styles.historyRow, index > 0 && { borderTopColor: t.border, borderTopWidth: StyleSheet.hairlineWidth }]}
                  >
                    <View style={styles.rowBody}>
                      <Text variant="subheadStrong">
                        {formatDateLabel(log.eatenAt)} · {formatTime(log.eatenAt)}
                      </Text>
                      <Text variant="caption" tone="subtle">
                        {[
                          log.rating != null ? starString(log.rating) : "not rated",
                          isReaction(log.reaction)
                            ? `${REACTION_META[log.reaction!].emoji} ${REACTION_META[log.reaction!].label}${
                                log.reactionNote ? ` — ${log.reactionNote}` : ""
                              }`
                            : "no reaction",
                          `by ${log.enteredByName}`,
                        ].join(" · ")}
                      </Text>
                    </View>
                    <IconButton
                      icon="trash"
                      label={`Delete this serving of ${selected.name}`}
                      variant="ghost"
                      size="sm"
                      onPress={() => removeServing(log)}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}
      </Sheet>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title={pendingDelete ? `Remove ${pendingDelete.name}?` : ""}
        message="Every serving of it goes too, for every caregiver."
        confirmLabel="Remove"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {activeBaby && (
        <LogMealSheet
          visible={showLog}
          onClose={() => setShowLog(false)}
          babyId={activeBaby.id}
          enteredByName={enteredByName}
          catalog={items}
          initialSelection={preselect}
          onSaved={() => load()}
        />
      )}
    </Screen>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: string }) {
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
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  headerText: { flex: 1 },
  statRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stat: { alignItems: "center", flex: 1, gap: space.xxs },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: "stretch" },
  list: { gap: space.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  pill: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill },
  detail: { gap: space.lg },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flagPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  history: {},
  historyRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  sheetFooter: { flexDirection: "row", gap: space.sm },
});
