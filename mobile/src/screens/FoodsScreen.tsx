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
  Input,
  Chip,
  ChipWrap,
  SectionHeader,
  Sheet,
  SkeletonList,
  FadeInUp,
  ConfirmDialog,
} from "../components/ui";
import LogMealSheet, {
  fromCatalog,
  StarRow,
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
  updateFoodLog,
  getSavedMeals,
  createSavedMeal,
  updateSavedMeal,
  deleteSavedMeal,
  type SavedMeal,
  type SavedMealFood,
  type MealType,
  type FoodItem,
  type FoodLog,
  type FoodReaction,
} from "../api/foods";
import {
  REACTION_META,
  REACTION_ORDER,
  ALLERGY_REACTIONS,
  isReaction,
  starString,
  foodEmoji,
  groupMeals,
  MEAL_TYPES,
  MEAL_TYPE_META,
  mealTypeForTime,
  type Meal,
} from "../lib/foods";
import { formatRelativeTime, formatDateLabel, formatTime } from "../utils/formatTime";

/** "Loved it · Rash" / "Not rated" — one serving, in a line. */
function servingSummary(log: FoodLog): string {
  const parts = [
    log.rating != null
      ? ["", "Refused", "Not keen", "Ate some", "Liked it", "Loved it"][log.rating]
      : "Not rated",
  ];
  if (isReaction(log.reaction)) parts.push(REACTION_META[log.reaction!].label);
  return parts.join(" · ");
}


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
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  /** The save / want-to-try sheet: what it's pre-filled with, or null. */
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null);
  const [preselectMealType, setPreselectMealType] = useState<MealType | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FoodItem | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [preselect, setPreselect] = useState<SelectedFood[] | undefined>(undefined);
  /** The serving open for editing from a meal card. */
  const [editingLog, setEditingLog] = useState<FoodLog | null>(null);
  /** The serving expanded for editing inside a food's history sheet. */
  const [editingHistoryId, setEditingHistoryId] = useState<number | null>(null);

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
      const [foods, history, saved] = await Promise.all([
        getFoods(babyId),
        getFoodLogs(babyId),
        // Absent on a server that predates saved meals — the rest still loads.
        getSavedMeals(babyId).catch(() => [] as SavedMeal[]),
      ]);
      setItems(foods);
      setLogs(history);
      setSavedMeals(saved);
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

  /*
   * The page reads as meals — what was eaten together, under its name —
   * rather than a flat list of foods. A food's own history is one tap into
   * any of its servings.
   */
  const meals = useMemo(() => groupMeals(logs), [logs]);
  const kept = useMemo(() => savedMeals.filter((m) => !m.wantToTry), [savedMeals]);
  const wanted = useMemo(() => savedMeals.filter((m) => m.wantToTry), [savedMeals]);
  const untried = useMemo(() => items.filter((i) => i.timesTried === 0), [items]);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

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

  /** A serving's rating or reaction was changed. The food's own summary
   *  (average, "watch" flag) is worked out by the server, so refetch. */
  const onServingSaved = (updated: FoodLog) => {
    setLogs((prev) => prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)));
    setEditingLog(null);
    setEditingHistoryId(null);
    toast.success(`${updated.foodItem?.name ?? "Serving"} updated.`);
    load();
  };

  const openLogWith = (pre?: SelectedFood[], mealType?: MealType | null) => {
    setPreselect(pre);
    setPreselectMealType(mealType ?? null);
    setShowLog(true);
  };

  /** Log a saved or planned meal: its foods, matched to the catalogue where
   *  she's had them before, new by name where she hasn't. */
  const logSavedMeal = (meal: SavedMeal) => {
    const selection: SelectedFood[] = meal.foods.map((f) => {
      const known = items.find((i) => i.name.toLowerCase() === f.name.toLowerCase());
      return known
        ? fromCatalog(known)
        : {
            key: `new:${f.name.toLowerCase()}`,
            name: f.name,
            emoji: foodEmoji(f.name, f.emoji),
            category: null,
            allergenHint: false,
            rating: null,
            reaction: "none",
            reactionNote: "",
          };
    });
    openLogWith(selection, meal.mealType);
  };

  const rateSavedMeal = async (meal: SavedMeal, rating: number | null) => {
    const prev = savedMeals;
    // Rating a planned meal is how it gets marked tried — it moves up into
    // the saved meals, rating and all.
    setSavedMeals((all) =>
      all.map((m) => (m.id === meal.id ? { ...m, rating, wantToTry: rating == null && m.wantToTry } : m))
    );
    try {
      const updated = await updateSavedMeal(meal.id, { rating });
      setSavedMeals((all) => all.map((m) => (m.id === updated.id ? updated : m)));
      if (meal.wantToTry && rating != null) toast.success(`${meal.name} tried and saved.`);
    } catch (err) {
      setSavedMeals(prev);
      toast.showError(err);
    }
  };

  const removeSavedMeal = async (meal: SavedMeal) => {
    const prev = savedMeals;
    setSavedMeals((all) => all.filter((m) => m.id !== meal.id));
    try {
      await deleteSavedMeal(meal.id);
    } catch (err) {
      setSavedMeals(prev);
      toast.showError(err);
    }
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

      {loading ? (
        <SkeletonList rows={5} />
      ) : (
        <>
          {/* Saved meals: the ones worth making again, one tap to log. */}
          {kept.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="Saved meals" />
              {kept.map((meal) => (
                <SavedMealCard
                  key={meal.id}
                  meal={meal}
                  onLog={() => logSavedMeal(meal)}
                  onRate={(rating) => rateSavedMeal(meal, rating)}
                  onRemove={() => removeSavedMeal(meal)}
                />
              ))}
            </View>
          )}

          {/* Want to try: planned meals. Rating one marks it tried. */}
          <View style={styles.section}>
            <SectionHeader
              title="Want to try"
              action={
                <Pressable
                  onPress={() => setPlanDraft({ wantToTry: true, name: "", mealType: null, foods: [] })}
                  hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Add a meal you want to try"
                >
                  <Text variant="subheadStrong" tone="accent">
                    ＋ Add
                  </Text>
                </Pressable>
              }
            />
            {wanted.length === 0 ? (
              <Text variant="footnote" tone="subtle">
                Plan a meal you'd like her to try. Once she has, rate it and
                it moves to your saved meals.
              </Text>
            ) : (
              wanted.map((meal) => (
                <SavedMealCard
                  key={meal.id}
                  meal={meal}
                  onLog={() => logSavedMeal(meal)}
                  onRate={(rating) => rateSavedMeal(meal, rating)}
                  onRemove={() => removeSavedMeal(meal)}
                />
              ))
            )}
          </View>

          <View style={styles.section}>
            <SectionHeader title="Meals" />
            {meals.length === 0 && untried.length === 0 ? (
              <EmptyState
                icon="sparkles"
                title="No meals yet"
                body="Log her first taste and it lands here with every meal that follows."
              />
            ) : (
              <View style={styles.list}>
                {meals.map((meal, index) => (
                  <FadeInUp key={meal.mealKey} index={index}>
                    <MealCard
                      meal={meal}
                      itemById={itemById}
                      onPressServing={setEditingLog}
                      onSave={() =>
                        setPlanDraft({
                          wantToTry: false,
                          name: MEAL_TYPE_META[meal.mealType].label,
                          mealType: meal.mealType,
                          foods: meal.logs.map((l) => ({
                            name: l.foodItem.name,
                            emoji: l.foodItem.emoji,
                          })),
                        })
                      }
                    />
                  </FadeInUp>
                ))}
                {untried.length > 0 && (
                  <Card padded={false} style={styles.mealCard}>
                    <View style={styles.mealHeader}>
                      <Text variant="subheadStrong">Not tried yet</Text>
                    </View>
                    {untried.map((item, index) => (
                      <Pressable
                        key={item.id}
                        onPress={() => setSelectedId(item.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`${item.name}, not tried yet. Shows its history.`}
                        style={({ pressed }) => [
                          styles.mealItem,
                          index > 0 && { borderTopColor: t.border, borderTopWidth: StyleSheet.hairlineWidth },
                          { opacity: pressed ? PRESSED_OPACITY : 1 },
                        ]}
                      >
                        <Emoji size={18}>{foodEmoji(item.name, item.emoji)}</Emoji>
                        <Text variant="body" style={styles.flex} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Icon name="chevronRight" size="sm" color={t.textSubtle} />
                      </Pressable>
                    ))}
                  </Card>
                )}
              </View>
            )}
          </View>
        </>
      )}

      <Button label="Log a meal" icon="plus" variant="primary" fullWidth onPress={() => openLogWith(undefined)} />

      {/* ------------------------------------------------- food history */}
      <Sheet
        visible={selected != null}
        onClose={() => {
          setSelectedId(null);
          setEditingHistoryId(null);
        }}
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
                    style={index > 0 && { borderTopColor: t.border, borderTopWidth: StyleSheet.hairlineWidth }}
                  >
                  {editingHistoryId === log.id ? (
                    <View style={styles.historyEditor}>
                      <Text variant="subheadStrong">
                        {formatDateLabel(log.eatenAt)} · {formatTime(log.eatenAt)}
                      </Text>
                      <ServingEditor
                        log={log}
                        onSaved={onServingSaved}
                        onCancel={() => setEditingHistoryId(null)}
                      />
                    </View>
                  ) : (
                  <View style={styles.historyRow}>
                    <Pressable
                      onPress={() => setEditingHistoryId(log.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Serving on ${formatDateLabel(log.eatenAt)}. Edit how it went.`}
                      style={({ pressed }) => [styles.rowBody, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
                    >
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
                    </Pressable>
                    <IconButton
                      icon="edit"
                      label={`Edit this serving of ${selected.name}`}
                      variant="ghost"
                      size="sm"
                      onPress={() => setEditingHistoryId(log.id)}
                    />
                    <IconButton
                      icon="trash"
                      label={`Delete this serving of ${selected.name}`}
                      variant="ghost"
                      size="sm"
                      onPress={() => removeServing(log)}
                    />
                  </View>
                  )}
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}
      </Sheet>

      {/* ------------------------------------------- edit one serving */}
      <Sheet
        visible={editingLog != null}
        onClose={() => setEditingLog(null)}
        title={
          editingLog
            ? `${foodEmoji(editingLog.foodItem.name, editingLog.foodItem.emoji)}  ${editingLog.foodItem.name}`
            : ""
        }
        subtitle={
          editingLog
            ? `${MEAL_TYPE_META[editingLog.mealType ?? mealTypeForTime(editingLog.eatenAt)].label} · ${formatDateLabel(editingLog.eatenAt)} · ${formatTime(editingLog.eatenAt)}`
            : undefined
        }
      >
        {editingLog ? (
          <View style={styles.detail}>
            <ServingEditor
              key={editingLog.id}
              log={editingLog}
              onSaved={onServingSaved}
              onCancel={() => setEditingLog(null)}
            />
            <Button
              label={`All servings of ${editingLog.foodItem.name}`}
              variant="ghost"
              onPress={() => {
                const id = editingLog.foodItemId;
                setEditingLog(null);
                setSelectedId(id);
              }}
            />
          </View>
        ) : null}
      </Sheet>

      {activeBaby && (
        <PlanMealSheet
          draft={planDraft}
          babyId={activeBaby.id}
          catalog={items}
          onClose={() => setPlanDraft(null)}
          onSaved={(meal) => {
            setSavedMeals((all) => [meal, ...all]);
            setPlanDraft(null);
            toast.success(meal.wantToTry ? `${meal.name} added to want to try.` : `${meal.name} saved.`);
          }}
        />
      )}

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
          initialMealType={preselectMealType}
          onSaved={() => load()}
        />
      )}
    </Screen>
  );
}

/** One meal: its name and time, then each food eaten in it. */
function MealCard({
  meal,
  itemById,
  onPressServing,
  onSave,
}: {
  meal: Meal;
  itemById: Map<number, FoodItem>;
  onPressServing: (log: FoodLog) => void;
  onSave: () => void;
}) {
  const t = useTheme();
  const count = meal.logs.length;
  return (
    <Card padded={false} style={styles.mealCard}>
      <View style={styles.mealHeader}>
        <View style={styles.rowBody}>
          <Text variant="title3">
            {MEAL_TYPE_META[meal.mealType].emoji} {MEAL_TYPE_META[meal.mealType].label}
          </Text>
          <Text variant="caption" tone="subtle">
            {formatDateLabel(meal.eatenAt)} · {formatTime(meal.eatenAt)} · {count} food
            {count === 1 ? "" : "s"} · {formatRelativeTime(meal.eatenAt)}
          </Text>
        </View>
        {meal.reacted && (
          <View style={[styles.pill, { backgroundColor: t.warningSoft ?? t.dangerSoft }]}>
            <Text variant="caption" style={{ color: t.warning }}>
              reaction
            </Text>
          </View>
        )}
        <Pressable
          onPress={onSave}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Save this ${MEAL_TYPE_META[meal.mealType].label.toLowerCase()} to log again`}
        >
          <Text variant="subheadStrong" tone="accent">
            Save
          </Text>
        </Pressable>
      </View>
      {meal.logs.map((log, index) => {
        const item = itemById.get(log.foodItemId);
        const watch = item?.allergen ?? log.foodItem.allergen;
        return (
          <Pressable
            key={log.id}
            onPress={() => onPressServing(log)}
            accessibilityRole="button"
            accessibilityLabel={`${log.foodItem.name}: ${servingSummary(log)}${
              watch ? ", flagged to watch" : ""
            }. Edit how it went.`}
            style={({ pressed }) => [
              styles.mealItem,
              index > 0 && { borderTopColor: t.border, borderTopWidth: StyleSheet.hairlineWidth },
              { opacity: pressed ? PRESSED_OPACITY : 1 },
            ]}
          >
            <View style={[styles.mealItemIcon, { backgroundColor: watch ? t.dangerSoft : t.accentSofter }]}>
              <Emoji size={18}>{foodEmoji(log.foodItem.name, log.foodItem.emoji)}</Emoji>
            </View>
            <View style={styles.rowBody}>
              <View style={styles.nameRow}>
                <Text variant="bodyStrong" numberOfLines={1} style={styles.flexShrink}>
                  {log.foodItem.name}
                </Text>
                {watch && (
                  <View style={[styles.pill, { backgroundColor: t.dangerSoft }]}>
                    <Text variant="caption" style={{ color: t.danger }}>
                      watch
                    </Text>
                  </View>
                )}
              </View>
              <Text
                variant="caption"
                numberOfLines={1}
                style={{ color: isReaction(log.reaction) ? t.warning : t.textSubtle }}
              >
                {isReaction(log.reaction) ? `${REACTION_META[log.reaction!].emoji} ` : ""}
                {servingSummary(log)}
              </Text>
            </View>
            {log.rating != null && (
              <Text variant="caption" style={{ color: t.warning }}>
                {starString(log.rating)}
              </Text>
            )}
            <Icon name="chevronRight" size="sm" color={t.textSubtle} />
          </Pressable>
        );
      })}
    </Card>
  );
}

/** A saved or want-to-try meal: name, foods, stars, and a way to log it. */
function SavedMealCard({
  meal,
  onLog,
  onRate,
  onRemove,
}: {
  meal: SavedMeal;
  onLog: () => void;
  onRate: (rating: number | null) => void;
  onRemove: () => void;
}) {
  const type = meal.mealType ? MEAL_TYPE_META[meal.mealType] : null;
  return (
    <Card style={styles.savedCard}>
      <View style={styles.nameRow}>
        <View style={styles.rowBody}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {type ? `${type.emoji} ` : ""}
            {meal.name}
          </Text>
          <Text variant="caption" tone="subtle" numberOfLines={2}>
            {[type && type.label !== meal.name ? type.label : null, meal.foods.map((f) => `${foodEmoji(f.name, f.emoji)} ${f.name}`).join(", ")]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
        <IconButton icon="trash" label={`Remove ${meal.name}`} variant="ghost" size="sm" onPress={onRemove} />
      </View>
      <StarRow
        value={meal.rating}
        onChange={onRate}
        size={22}
        label={meal.wantToTry ? `Tried ${meal.name}? Rate it` : `Rate ${meal.name}`}
      />
      <Button label={meal.wantToTry ? "Log it now" : "Log it again"} icon="plus" variant="secondary" size="sm" onPress={onLog} />
    </Card>
  );
}

type PlanDraft = {
  wantToTry: boolean;
  name: string;
  mealType: MealType | null;
  foods: SavedMealFood[];
};

/** Name a meal and its foods — to keep (from a logged meal) or to try. */
function PlanMealSheet({
  draft,
  babyId,
  catalog,
  onClose,
  onSaved,
}: {
  draft: PlanDraft | null;
  babyId: number;
  catalog: FoodItem[];
  onClose: () => void;
  onSaved: (meal: SavedMeal) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [mealType, setMealType] = useState<MealType | null>(null);
  const [foods, setFoods] = useState<SavedMealFood[]>([]);
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!draft) return;
    setName(draft.name);
    setMealType(draft.mealType);
    setFoods(draft.foods);
    setTyped("");
  }, [draft]);

  const has = (n: string) => foods.some((f) => f.name.toLowerCase() === n.toLowerCase());
  const addFood = (n: string, emoji: string | null = null) => {
    const clean = n.trim();
    if (!clean || has(clean)) return;
    setFoods((all) => [...all, { name: clean.charAt(0).toUpperCase() + clean.slice(1), emoji }]);
  };
  const addTyped = () => {
    typed.split(",").forEach((part) => addFood(part));
    setTyped("");
  };

  const save = async () => {
    if (!draft) return;
    const pending = typed.trim()
      ? typed.split(",").map((p) => p.trim()).filter((p) => p && !has(p)).map((p) => ({ name: p, emoji: null }))
      : [];
    const allFoods = [...foods, ...pending];
    if (!name.trim()) return toast.error("Give the meal a name.");
    if (allFoods.length === 0) return toast.error("Add at least one food.");
    setSaving(true);
    try {
      onSaved(
        await createSavedMeal({
          babyId,
          name: name.trim(),
          mealType,
          foods: allFoods,
          wantToTry: draft.wantToTry,
        })
      );
    } catch (err) {
      toast.showError(err);
    } finally {
      setSaving(false);
    }
  };

  const recent = catalog.filter((c) => !has(c.name)).slice(0, 12);

  return (
    <Sheet
      visible={draft != null}
      onClose={onClose}
      title={draft?.wantToTry ? "A meal to try" : "Save this meal"}
      subtitle={draft?.wantToTry ? "Plan it now, rate it once she's tried it." : "Log it again in one tap."}
      footer={
        <View style={styles.sheetFooter}>
          <Button label="Cancel" variant="ghost" onPress={onClose} style={styles.flex} />
          <Button label="Save" variant="primary" loading={saving} onPress={save} style={styles.flex} />
        </View>
      }
    >
      <View style={styles.detail}>
        <Input label="Name" value={name} onChangeText={setName} placeholder="Sunday porridge" />
        <ChipWrap>
          {MEAL_TYPES.map((m) => (
            <Chip
              key={m.value}
              label={m.label}
              emoji={m.emoji}
              selected={mealType === m.value}
              onPress={() => setMealType(mealType === m.value ? null : m.value)}
            />
          ))}
        </ChipWrap>
        {foods.length > 0 && (
          <ChipWrap>
            {foods.map((f) => (
              <Chip
                key={f.name}
                label={f.name}
                emoji={foodEmoji(f.name, f.emoji)}
                selected
                onPress={() => setFoods((all) => all.filter((x) => x !== f))}
              />
            ))}
          </ChipWrap>
        )}
        <Input
          label="Foods"
          value={typed}
          onChangeText={setTyped}
          placeholder="Oats, banana, yogurt…"
          returnKeyType="done"
          onSubmitEditing={addTyped}
          helper="Separate with commas. Tap a food above to remove it."
        />
        {recent.length > 0 && (
          <ChipWrap>
            {recent.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                emoji={foodEmoji(c.name, c.emoji)}
                onPress={() => addFood(c.name, c.emoji)}
              />
            ))}
          </ChipWrap>
        )}
      </View>
    </Sheet>
  );
}

/**
 * Change how one serving went after it was saved — the stars, the reaction,
 * and what happened. Reactions often show up hours later, long after the
 * meal was logged as "Fine".
 */
function ServingEditor({
  log,
  onSaved,
  onCancel,
}: {
  log: FoodLog;
  onSaved: (updated: FoodLog) => void;
  onCancel: () => void;
}) {
  const t = useTheme();
  const toast = useToast();
  const name = log.foodItem.name;
  const [rating, setRating] = useState<number | null>(log.rating);
  const [reaction, setReaction] = useState<FoodReaction>(log.reaction ?? "none");
  const [note, setNote] = useState(log.reactionNote ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateFoodLog(log.id, {
        rating,
        reaction,
        reactionNote: reaction === "none" ? null : note.trim() || null,
      });
      onSaved({ ...updated, foodItem: updated.foodItem ?? log.foodItem });
    } catch (err) {
      toast.showError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.editor}>
      <StarRow value={rating} onChange={setRating} label={`How much did she like ${name}`} />
      <ChipWrap>
        {REACTION_ORDER.map((r) => (
          <Chip
            key={r}
            label={REACTION_META[r].label}
            emoji={REACTION_META[r].emoji}
            selected={reaction === r}
            onPress={() => setReaction(r)}
          />
        ))}
      </ChipWrap>
      {reaction !== "none" && (
        <Input
          label="What happened?"
          value={note}
          onChangeText={setNote}
          placeholder="Small rash on the cheeks after ~20 min…"
          returnKeyType="done"
        />
      )}
      {ALLERGY_REACTIONS.has(reaction) && (
        <Text variant="footnote" style={{ color: t.warning }}>
          {name} will be flagged to watch. Swelling or any trouble breathing
          needs urgent medical help.
        </Text>
      )}
      <View style={styles.sheetFooter}>
        <Button label="Cancel" variant="ghost" onPress={onCancel} style={styles.flex} />
        <Button label="Save" variant="primary" loading={saving} onPress={save} style={styles.flex} />
      </View>
    </View>
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
  mealCard: { overflow: "hidden" },
  mealHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  mealItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  mealItemIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  editor: { gap: space.md },
  section: { gap: space.sm },
  savedCard: { gap: space.sm },
  historyEditor: { gap: space.sm, paddingVertical: space.sm },
});
