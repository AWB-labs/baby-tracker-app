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

  const allMeals = useMemo(() => groupMeals(todayLogs), [todayLogs]);
  // Only the latest meal on Home — the full day is a tap away on Foods.
  const latest = allMeals[0] ?? null;
  const meals = latest ? [latest] : [];
  const latestRated = latest ? latest.logs.filter((l) => l.rating != null) : [];
  const latestAvg =
    latestRated.length > 0
      ? latestRated.reduce((s, l) => s + (l.rating ?? 0), 0) / latestRated.length
      : null;
  const latestReaction = latest ? latest.logs.find((l) => isReaction(l.reaction)) ?? null : null;
  const triedCount = catalog.filter((c) => c.timesTried > 0).length;
  const watchCount = catalog.filter((c) => c.allergen).length;

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
        padded={false}
        style={styles.card}
      >
        {/* Same anatomy as a Track row — icon chip, name, context line,
            trailing control — so the five cards on Today read as one list. */}
        <View style={[styles.iconChip, { backgroundColor: t.warningSoft }]}>
          <Emoji size={22}>🥣</Emoji>
        </View>

        <View style={styles.body}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {!loaded
              ? "Food"
              : latest
                ? latest.logs
                    .map((l) => `${l.foodItem.emoji ?? ""} ${l.foodItem.name}`.trim())
                    .join(" + ")
                : "Nothing eaten yet today"}
          </Text>

          {latest && (
            <View style={styles.metaRow}>
              <Text variant="caption" tone="subtle" tabular numberOfLines={1}>
                {formatTime(latest.eatenAt)}
              </Text>
              {latestAvg != null && (
                <Text variant="caption" style={{ color: t.warning }}>
                  {starString(latestAvg)}
                </Text>
              )}
              {latestReaction && (
                <View style={[styles.reactionPill, { backgroundColor: t.warningSoft }]}>
                  <Emoji size={11}>{REACTION_META[latestReaction.reaction!].emoji}</Emoji>
                  <Text variant="caption" style={{ color: t.warning }} numberOfLines={1}>
                    {REACTION_META[latestReaction.reaction!].label}
                  </Text>
                </View>
              )}
            </View>
          )}

          <Text variant="caption" tone="subtle" numberOfLines={1}>
            {latest
              ? `${allMeals.length} meal${allMeals.length === 1 ? "" : "s"} today · ${summary}`
              : summary}
          </Text>
        </View>

        <Icon name="chevronRight" size="md" color={t.textSubtle} />
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
  // Mirrors TrackRow's idle row metrics, so this card lines up with the four
  // above it: same chip size, same padding, same minimum height.
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    minHeight: 76,
  },
  iconChip: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  reactionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 1,
    borderRadius: radius.pill,
    flexShrink: 1,
  },
});
