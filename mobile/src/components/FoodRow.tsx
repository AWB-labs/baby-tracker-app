import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../design/ThemeProvider";
import { space, radius, PRESSED_OPACITY } from "../design/tokens";
import { Card, Text, Emoji } from "./ui";
import LogMealSheet from "./LogMealSheet";
import { getFoodLogs, getFoods, type FoodItem, type FoodLog } from "../api/foods";
import { groupMeals, todayRange, isReaction, REACTION_META } from "../lib/foods";
import { formatRelativeTime } from "../utils/formatTime";

interface Props {
  babyId: number;
  enteredByName: string;
  /** Bumped by the parent on pull-to-refresh so today's meals re-fetch. */
  refreshKey?: number;
  /** Open the full foods screen (catalogue, allergies, history). */
  onOpenFoods: () => void;
}

/**
 * Food as one more Track row, shaped exactly like the feed/sleep/diaper rows
 * above it: icon, name, what she last ate and when, and a Log button. The
 * catalogue, ratings and reaction history live a tap deeper on the Foods
 * screen — tapping the row's name opens it.
 */
export default function FoodRow({
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
  // Newest meal first, like the other rows' "last one".
  const latest = meals[meals.length - 1] ?? null;
  const triedCount = catalog.filter((c) => c.timesTried > 0).length;
  const reaction = todayLogs.find((l) => isReaction(l.reaction)) ?? null;

  /** Context line under the name — same shape as the other rows' idleMeta. */
  const meta = !loaded
    ? "—"
    : latest
      ? [
          formatRelativeTime(latest.eatenAt),
          latest.logs
            .map((l) => `${l.foodItem.emoji ?? ""} ${l.foodItem.name}`.trim())
            .join(" + "),
        ].join(" · ")
      : triedCount > 0
        ? `Nothing yet today · ${triedCount} food${triedCount === 1 ? "" : "s"} tried`
        : "Nothing yet";

  return (
    <>
      <Card padded={false} style={styles.row}>
        <Pressable
          onPress={onOpenFoods}
          accessibilityRole="button"
          accessibilityLabel={`Food: ${meta}. Opens the foods screen.`}
          style={({ pressed }) => [styles.left, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <View style={[styles.iconChip, { backgroundColor: t.warningSoft }]}>
            <Emoji size={22}>🥣</Emoji>
          </View>
          <View style={styles.nameCol}>
            <View style={styles.nameRow}>
              <Text variant="bodyStrong" numberOfLines={1}>
                Food
              </Text>
              {/* A reaction today is the one thing worth flagging up here. */}
              {reaction && (
                <View style={[styles.reactionPill, { backgroundColor: t.warningSoft }]}>
                  <Emoji size={11}>{REACTION_META[reaction.reaction!].emoji}</Emoji>
                  <Text variant="caption" style={{ color: t.warning }} numberOfLines={1}>
                    {REACTION_META[reaction.reaction!].label}
                  </Text>
                </View>
              )}
            </View>
            <Text variant="caption" tone="subtle" tabular numberOfLines={1}>
              {meta}
            </Text>
          </View>
        </Pressable>

        {/* Same button as the diaper row's Log, so the five rows line up. */}
        <Pressable
          onPress={() => setShowLog(true)}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          accessibilityRole="button"
          accessibilityLabel="Log a meal"
          style={({ pressed }) => [
            styles.mini,
            {
              backgroundColor: t.accentSofter,
              borderColor: t.borderStrong,
              opacity: pressed ? PRESSED_OPACITY : 1,
            },
          ]}
        >
          <Text variant="title3" style={{ color: t.accentText }}>＋</Text>
          <Text variant="bodyStrong" style={{ color: t.accentText }}>
            Log
          </Text>
        </Pressable>
      </Card>

      <LogMealSheet
        visible={showLog}
        onClose={() => setShowLog(false)}
        babyId={babyId}
        enteredByName={enteredByName}
        catalog={catalog}
        onSaved={() => load()}
      />
    </>
  );
}

// Mirrors TrackRow's idle row metrics so the Food row sits in the same list
// without a visible seam.
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    minHeight: 76,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    flex: 1,
    minWidth: 0,
  },
  iconChip: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  nameCol: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  reactionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 1,
    borderRadius: radius.pill,
    flexShrink: 1,
  },
  mini: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    width: 96,
    height: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
});
