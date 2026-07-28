import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { useTheme } from "../design/ThemeProvider";
import { space, radius, DISABLED_OPACITY } from "../design/tokens";
import { Icon } from "../design/icons";
import {
  Text,
  Emoji,
  SectionHeader,
  Button,
  IconButton,
  Sheet,
  FadeInUp,
} from "./ui";
import { useToast } from "./Toast";
import { createLog, fetchLogs, type LogEntry } from "../api/logs";
import {
  loadHabits,
  saveHabits,
  computeHabitStats,
  type HabitDef,
  type HabitStats,
} from "../lib/habits";

/**
 * Streaks need more history than the home screen's cheap 50-row fetch holds
 * (a 30-day vitamin streak is 30 days of logs). Habit entries are sparse, so
 * one deeper fetch on mount — not polled — covers it.
 */
const STREAK_FETCH_LIMIT = 400;

interface Props {
  babyId: number;
  enteredByName: string;
  onLogSaved: () => void;
  /** Bumped by the parent on pull-to-refresh so streaks re-fetch too. */
  refreshKey?: number;
}

/**
 * Once-a-day routines, now the family's own list.
 *
 * Each tile is one tap to mark done for today. A 🔥 streak makes the routine
 * worth keeping; a broken one says "Missed" in words and colour rather than
 * silently resetting, so yesterday's slip is visible without being scolding.
 * Which habits appear, and in what order, is chosen in the customize sheet.
 */
export default function Habits({
  babyId,
  enteredByName,
  onLogSaved,
  refreshKey = 0,
}: Props) {
  const t = useTheme();
  const toast = useToast();

  const [habits, setHabits] = useState<HabitDef[]>([]);
  const [history, setHistory] = useState<LogEntry[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [showCustomize, setShowCustomize] = useState(false);

  // Per-baby config from the device.
  useEffect(() => {
    let alive = true;
    loadHabits(babyId).then((loaded) => {
      if (alive) setHabits(loaded);
    });
    return () => {
      alive = false;
    };
  }, [babyId]);

  // Deep-enough history for streaks.
  const refreshHistory = useCallback(async () => {
    try {
      const data = await fetchLogs(babyId, STREAK_FETCH_LIMIT);
      setHistory(data);
    } catch {
      /* streaks just stay stale */
    }
  }, [babyId]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory, refreshKey]);

  const stats = useMemo(() => {
    const map = new Map<string, HabitStats>();
    for (const habit of habits) {
      map.set(habit.type, computeHabitStats(history, habit.type));
    }
    return map;
  }, [habits, history]);

  const enabled = habits.filter((h) => h.enabled);

  const handleLog = useCallback(
    async (habit: HabitDef) => {
      const stat = stats.get(habit.type);
      if (saving || stat?.doneToday) return;
      setSaving(habit.type);
      const now = new Date();
      try {
        await createLog({
          babyId,
          type: habit.type,
          startTime: now.toISOString(),
          endTime: now.toISOString(),
          enteredByName,
        });
        onLogSaved();
        await refreshHistory();
        toast.success(`${habit.label} done.`);
      } catch (err) {
        toast.showError(err);
      } finally {
        setSaving(null);
      }
    },
    [saving, stats, babyId, enteredByName, onLogSaved, refreshHistory, toast]
  );

  const persist = useCallback(
    (next: HabitDef[]) => {
      setHabits(next);
      saveHabits(babyId, next);
    },
    [babyId]
  );

  const toggleHabit = useCallback(
    (type: string) => {
      persist(
        habits.map((h) => (h.type === type ? { ...h, enabled: !h.enabled } : h))
      );
    },
    [habits, persist]
  );

  const moveHabit = useCallback(
    (type: string, dir: -1 | 1) => {
      const index = habits.findIndex((h) => h.type === type);
      const target = index + dir;
      if (index < 0 || target < 0 || target >= habits.length) return;
      const next = [...habits];
      [next[index], next[target]] = [next[target], next[index]];
      persist(next);
    },
    [habits, persist]
  );

  if (habits.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHeader
        title="Habits"
        action={
          <Pressable
            onPress={() => setShowCustomize(true)}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Customize habits"
          >
            <Text variant="subheadStrong" tone="accent">
              Customize
            </Text>
          </Pressable>
        }
      />

      {enabled.length === 0 ? (
        <Pressable
          onPress={() => setShowCustomize(true)}
          accessibilityRole="button"
          accessibilityLabel="All habits are hidden. Customize habits."
          style={[
            styles.emptyRow,
            { borderColor: t.borderStrong, backgroundColor: t.accentSofter },
          ]}
        >
          <Text variant="subhead" style={{ color: t.accentText }}>
            All habits are hidden — tap to choose some
          </Text>
        </Pressable>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tileRow}
        >
          {enabled.map((habit, index) => {
            const stat = stats.get(habit.type) ?? {
              doneToday: false,
              streak: 0,
              missed: false,
            };
            const busy = saving === habit.type;
            const state = stat.doneToday
              ? "done"
              : stat.missed
                ? "missed"
                : "pending";

            const a11y = stat.doneToday
              ? `${habit.label}, done today, ${stat.streak}-day streak`
              : stat.missed
                ? `${habit.label}, missed yesterday, streak reset. Log ${habit.label.toLowerCase()} for today`
                : `${habit.label}${
                    stat.streak > 0 ? `, ${stat.streak}-day streak` : ""
                  }. Log ${habit.label.toLowerCase()} for today`;

            return (
              <FadeInUp key={habit.type} index={index}>
                <Pressable
                  onPress={() => handleLog(habit)}
                  disabled={stat.doneToday || saving !== null}
                  accessibilityRole="button"
                  accessibilityLabel={a11y}
                  accessibilityState={{
                    selected: stat.doneToday,
                    disabled: stat.doneToday,
                  }}
                  style={({ pressed }) => [
                    styles.tile,
                    {
                      backgroundColor:
                        state === "done" ? t.successSoft : t.surface,
                      borderColor:
                        state === "done"
                          ? t.successBorder
                          : state === "missed"
                            ? t.warningBorder
                            : t.border,
                      opacity: busy
                        ? DISABLED_OPACITY
                        : pressed
                          ? 0.75
                          : 1,
                    },
                  ]}
                >
                  {state === "done" && (
                    <View style={[styles.tick, { backgroundColor: t.success }]}>
                      <Icon
                        name="check"
                        size="xs"
                        color={t.textInverse}
                        strokeWidth={3}
                      />
                    </View>
                  )}
                  <Emoji size={24} style={state === "done" && styles.doneEmoji}>
                    {habit.emoji}
                  </Emoji>
                  <Text
                    variant="caption"
                    numberOfLines={1}
                    style={{
                      color: state === "done" ? t.success : t.text,
                      fontWeight: "700",
                    }}
                  >
                    {busy ? "Saving…" : habit.label}
                  </Text>
                  {state === "missed" ? (
                    <View
                      style={[styles.stateChip, { backgroundColor: t.warningSoft }]}
                    >
                      <Icon name="alert" size="xs" color={t.warning} />
                      <Text variant="caption" style={{ color: t.warning }}>
                        Missed
                      </Text>
                    </View>
                  ) : stat.streak > 0 ? (
                    <View
                      style={[styles.stateChip, { backgroundColor: t.warningSoft }]}
                    >
                      <Emoji size={11}>🔥</Emoji>
                      <Text variant="caption" tabular style={{ color: t.warning }}>
                        {stat.streak}
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={[styles.stateChip, { backgroundColor: t.accentSoft }]}
                    >
                      <Text variant="caption" style={{ color: t.accentText }}>
                        Today?
                      </Text>
                    </View>
                  )}
                </Pressable>
              </FadeInUp>
            );
          })}
        </ScrollView>
      )}

      {/* ----------------------------------------------------- customize */}
      <Sheet
        visible={showCustomize}
        onClose={() => setShowCustomize(false)}
        title="Customize habits"
        subtitle="Choose the once-a-day routines on your Today screen. Each keeps its own streak."
        footer={
          <Button
            label="Done"
            variant="primary"
            fullWidth
            onPress={() => setShowCustomize(false)}
          />
        }
      >
        <View style={styles.custList}>
          {habits.map((habit, index) => {
            const stat = stats.get(habit.type);
            const caption = !habit.enabled
              ? "Hidden"
              : stat?.doneToday
                ? `Done today · 🔥 ${stat.streak}-day streak`
                : stat && stat.streak > 0
                  ? `🔥 ${stat.streak}-day streak`
                  : stat?.missed
                    ? "Missed yesterday · streak reset"
                    : "No streak yet";
            return (
              <View
                key={habit.type}
                style={[styles.custItem, index > 0 && { borderTopColor: t.border, borderTopWidth: StyleSheet.hairlineWidth }]}
              >
                <View style={[styles.custEmoji, { backgroundColor: t.accentSoft }]}>
                  <Emoji size={19}>{habit.emoji}</Emoji>
                </View>
                <View style={styles.custMid}>
                  <Text variant="bodyStrong">{habit.label}</Text>
                  <Text variant="caption" tone="subtle">
                    {caption}
                  </Text>
                </View>
                <IconButton
                  icon="chevronUp"
                  label={`Move ${habit.label} up`}
                  variant="ghost"
                  size="sm"
                  disabled={index === 0}
                  onPress={() => moveHabit(habit.type, -1)}
                />
                <IconButton
                  icon="chevronDown"
                  label={`Move ${habit.label} down`}
                  variant="ghost"
                  size="sm"
                  disabled={index === habits.length - 1}
                  onPress={() => moveHabit(habit.type, 1)}
                />
                <Switch
                  value={habit.enabled}
                  onValueChange={() => toggleHabit(habit.type)}
                  trackColor={{ false: t.border, true: t.accent }}
                  thumbColor={t.surface}
                  accessibilityLabel={`${habit.label} ${
                    habit.enabled ? "shown" : "hidden"
                  } on Today`}
                />
              </View>
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  tileRow: { gap: space.sm, paddingVertical: space.xxs, paddingRight: space.lg },
  tile: {
    width: 104,
    minHeight: 96,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
  },
  doneEmoji: { opacity: 0.6 },
  tick: {
    position: "absolute",
    top: space.xs,
    right: space.xs,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  stateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  emptyRow: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 64,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderStyle: "dashed",
    paddingHorizontal: space.lg,
  },
  custList: {},
  custItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.md,
  },
  custEmoji: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  custMid: { flex: 1, minWidth: 0, gap: 1 },
});
