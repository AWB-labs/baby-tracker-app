import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../design/ThemeProvider";
import { space, radius } from "../design/tokens";
import { Icon } from "../design/icons";
import { PressableCard, SectionHeader, Text, Emoji } from "./ui";
import LogMealSheet from "./LogMealSheet";
import { getFoodLogs, getFoods, type FoodItem, type FoodLog } from "../api/foods";
import {
  groupMeals,
  mealTitle,
  todayRange,
  isReaction,
  starString,
  REACTION_META,
} from "../lib/foods";
import { formatTime } from "../utils/formatTime";

interface Props {
  babyId: number;
  enteredByName: string;
  /** Bumped by the parent on pull-to-refresh so today's meals re-fetch. */
  refreshKey?: number;
  /** Open the full foods screen (catalogue, allergies, history). */
  onOpenFoods: () => void;
}

/**
 * Today's plate, on Home: each meal she's had today as one line ("12:30 ·
 * Carrot + Potato ★★★★"), a reaction flagged where it happened, and one tap
 * to log the next meal. The catalogue and its history live a tap deeper on
 * the Foods screen — this card answers "what has she eaten today", nothing
 * more.
 */
export default function FoodSection({
  babyId,
  enteredByName,
  refreshKey = 0,
  onOpenFoods,
}: Props) {
  const t = useTheme();
  const [todayLogs, setTodayLogs] = useState<FoodLog[]>([]);
  const [catalog, setCatalog] = useState<FoodItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const load = useCallback(async () => {
    try {
      const [logs, items] = await Promise.all([
        getFoodLogs(babyId, todayRange()),
        getFoods(babyId),
      ]);
      setTodayLogs(logs);
      setCatalog(items);
    } catch {
      /* the last good plate stays on screen */
    } finally {
      setLoaded(true);
    }
  }, [babyId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const meals = useMemo(() => groupMeals(todayLogs), [todayLogs]);
  const triedCount = catalog.filter((c) => c.timesTried > 0).length;
  const watchCount = catalog.filter((c) => c.allergen).length;
  const distinctToday = new Set(todayLogs.map((l) => l.foodItemId)).size;

  const summary =
    triedCount === 0
      ? "Starting solids? Log her first taste."
      : [
          `${triedCount} food${triedCount === 1 ? "" : "s"} tried`,
          watchCount > 0 ? `${watchCount} to watch` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <View style={styles.section}>
      <SectionHeader
        title="Food"
        action={
          <Pressable
            onPress={() => setShowLog(true)}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Log a meal"
          >
            <Text variant="subheadStrong" tone="accent">
              ＋ Log meal
            </Text>
          </Pressable>
        }
      />

      <PressableCard
        onPress={onOpenFoods}
        accessibilityLabel={
          meals.length === 0
            ? `Nothing eaten yet today. ${summary} Opens the foods screen.`
            : `Today: ${meals
                .map((m) => mealTitle(m))
                .join("; ")}. ${summary} Opens the foods screen.`
        }
        style={styles.card}
      >
        <View style={styles.top}>
          <View style={styles.labelRow}>
            <Emoji size={14}>🥣</Emoji>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {meals.length === 0
                ? "Today"
                : `Today · ${distinctToday} food${distinctToday === 1 ? "" : "s"}`}
            </Text>
          </View>
          <Icon name="chevronRight" size="sm" color={t.textSubtle} />
        </View>

        {!loaded ? (
          <Text variant="title3" tabular style={{ color: t.textSubtle }}>
            —
          </Text>
        ) : meals.length === 0 ? (
          <Text variant="subhead" tone="subtle">
            Nothing eaten yet today.
          </Text>
        ) : (
          <View style={styles.meals}>
            {meals.map((meal) => {
              const rated = meal.logs.filter((l) => l.rating != null);
              const avg =
                rated.length > 0
                  ? rated.reduce((s, l) => s + (l.rating ?? 0), 0) / rated.length
                  : null;
              const reaction = meal.logs.find((l) => isReaction(l.reaction));
              return (
                <View key={meal.mealKey} style={styles.mealRow}>
                  <Text variant="caption" tone="subtle" tabular style={styles.mealTime}>
                    {formatTime(meal.eatenAt)}
                  </Text>
                  <View style={styles.mealBody}>
                    <Text variant="bodyStrong" numberOfLines={2}>
                      {meal.logs.map((l) => `${l.foodItem.emoji ?? ""} ${l.foodItem.name}`.trim()).join(" + ")}
                    </Text>
                    <View style={styles.mealMeta}>
                      {avg != null && (
                        <Text variant="caption" style={{ color: t.warning }}>
                          {starString(avg)}
                        </Text>
                      )}
                      {reaction && (
                        <View style={[styles.reactionPill, { backgroundColor: t.warningSoft }]}>
                          <Emoji size={11}>{REACTION_META[reaction.reaction!].emoji}</Emoji>
                          <Text variant="caption" style={{ color: t.warning }}>
                            {reaction.foodItem.name}: {REACTION_META[reaction.reaction!].label.toLowerCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <Text variant="caption" tone="subtle" numberOfLines={1}>
          {summary}
        </Text>
      </PressableCard>

      <LogMealSheet
        visible={showLog}
        onClose={() => setShowLog(false)}
        babyId={babyId}
        enteredByName={enteredByName}
        catalog={catalog}
        onSaved={() => load()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  card: { padding: space.md, gap: space.sm },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
  },
  labelRow: { flexDirection: "row", alignItems: "center", gap: space.xs, flexShrink: 1 },
  meals: { gap: space.sm },
  mealRow: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  mealTime: { width: 64, paddingTop: 3 },
  mealBody: { flex: 1, minWidth: 0, gap: 2 },
  mealMeta: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  reactionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
});
