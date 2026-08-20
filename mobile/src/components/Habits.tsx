import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useTheme } from "../design/ThemeProvider";
import { space, radius, DISABLED_OPACITY, PRESSED_OPACITY } from "../design/tokens";
import { Icon } from "../design/icons";
import {
  Text,
  Emoji,
  SectionHeader,
  Button,
  IconButton,
  Input,
  Sheet,
  FadeInUp,
} from "./ui";
import { useToast } from "./Toast";
import { createLog, deleteLog, fetchLogs, type LogEntry } from "../api/logs";
import {
  loadHabits,
  saveHabits,
  computeHabitStats,
  habitTracksStreak,
  makeCustomHabit,
  editHabit,
  HABIT_CATALOG,
  HABIT_EMOJI_CHOICES,
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
/** Emoji tiles per row in the icon pickers below. */
const EMOJI_COLUMNS = 7;

export default function Habits({
  babyId,
  enteredByName,
  onLogSaved,
  refreshKey = 0,
}: Props) {
  const t = useTheme();
  const toast = useToast();

  const { width: windowWidth } = useWindowDimensions();
  // Sheet pads its content by space.lg on each side; a flat 44px tile leaves a
  // dead gap most rows are just short of filling one more of. Sizing tiles to
  // what's actually left fills the row exactly, on any device.
  const emojiTileSize = Math.max(
    36,
    Math.floor(
      (windowWidth - space.lg * 2 - space.xs * (EMOJI_COLUMNS - 1)) / EMOJI_COLUMNS
    )
  );

  const [habits, setHabits] = useState<HabitDef[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState<LogEntry[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [showCustomize, setShowCustomize] = useState(false);
  const [newHabitName, setNewHabitName] = useState("");
  const [newHabitEmoji, setNewHabitEmoji] = useState(HABIT_EMOJI_CHOICES[0]);
  // Which habit's row, if any, is showing its edit form in place of the
  // normal row — never more than one at a time.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editEmoji, setEditEmoji] = useState(HABIT_EMOJI_CHOICES[0]);

  // Per-baby config from the device.
  useEffect(() => {
    let alive = true;
    setLoaded(false);
    loadHabits(babyId).then((next) => {
      if (alive) {
        setHabits(next);
        setLoaded(true);
      }
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
      map.set(habit.key, computeHabitStats(history, habit));
    }
    return map;
  }, [habits, history]);

  const enabled = habits.filter((h) => h.enabled);

  const handleLog = useCallback(
    async (habit: HabitDef) => {
      const stat = stats.get(habit.key);
      if (saving) return;
      setSaving(habit.key);
      const now = new Date();
      try {
        if (stat?.doneToday) {
          // Tapping a done habit undoes it: remove today's entry so a slipped
          // finger isn't a locked-in tick until midnight. Matching mirrors
          // computeHabitStats — custom habits share the "habit" type and are
          // told apart by the name in comments.
          const today = now.toDateString();
          const entry = history.find(
            (l) =>
              (habit.custom
                ? l.type === "habit" && l.comments === habit.label
                : l.type === habit.type) &&
              new Date(l.startTime).toDateString() === today
          );
          if (entry) await deleteLog(entry.id);
          onLogSaved();
          await refreshHistory();
          toast.success(`${habit.label} unmarked.`);
        } else {
          await createLog({
            babyId,
            type: habit.type,
            // A custom habit's name is what identifies it, both to the streak
            // maths and to anyone reading the entry in the Activity tab.
            comments: habit.custom ? habit.label : null,
            startTime: now.toISOString(),
            endTime: now.toISOString(),
            enteredByName,
          });
          onLogSaved();
          await refreshHistory();
          toast.success(`${habit.label} done.`);
        }
      } catch (err) {
        toast.showError(err);
      } finally {
        setSaving(null);
      }
    },
    [saving, stats, history, babyId, enteredByName, onLogSaved, refreshHistory, toast]
  );

  const persist = useCallback(
    (next: HabitDef[]) => {
      setHabits(next);
      saveHabits(babyId, next);
    },
    [babyId]
  );

  const addHabit = useCallback(
    (def: HabitDef) => {
      if (habits.some((h) => h.key === def.key)) return;
      persist([...habits, { ...def, enabled: true }]);
    },
    [habits, persist]
  );

  const removeHabit = useCallback(
    (key: string) => {
      persist(habits.filter((h) => h.key !== key));
    },
    [habits, persist]
  );

  const moveHabit = useCallback(
    (key: string, dir: -1 | 1) => {
      const index = habits.findIndex((h) => h.key === key);
      const target = index + dir;
      if (index < 0 || target < 0 || target >= habits.length) return;
      const next = [...habits];
      [next[index], next[target]] = [next[target], next[index]];
      persist(next);
    },
    [habits, persist]
  );

  /** Invent one that isn't in the catalogue at all. */
  const addCustomHabit = useCallback(() => {
    const name = newHabitName.trim();
    if (!name) return;
    const def = makeCustomHabit(name, newHabitEmoji);
    if (habits.some((h) => h.key === def.key)) {
      toast.error(`You already have a habit called ${name}.`);
      return;
    }
    addHabit(def);
    setNewHabitName("");
    setNewHabitEmoji(HABIT_EMOJI_CHOICES[0]);
  }, [newHabitName, newHabitEmoji, habits, addHabit, toast]);

  const startEdit = useCallback((habit: HabitDef) => {
    setEditingKey(habit.key);
    setEditLabel(habit.label);
    setEditEmoji(habit.emoji);
  }, []);

  const cancelEdit = useCallback(() => setEditingKey(null), []);

  /** Rename and/or re-icon whichever habit is currently open for edit. */
  const saveEdit = useCallback(() => {
    if (!editingKey) return;
    const name = editLabel.trim();
    if (!name) return;
    const dup = habits.some(
      (h) => h.key !== editingKey && h.label.toLowerCase() === name.toLowerCase()
    );
    if (dup) {
      toast.error(`You already have a habit called ${name}.`);
      return;
    }
    persist(
      habits.map((h) => (h.key === editingKey ? editHabit(h, name, editEmoji) : h))
    );
    setEditingKey(null);
  }, [editingKey, editLabel, editEmoji, habits, persist, toast]);

  // Catalogue habits the family hasn't added yet — the "Add a habit" list.
  const available = HABIT_CATALOG.filter(
    (c) => !habits.some((h) => h.key === c.key)
  );

  // Wait for the device config before drawing, so removed habits don't flash
  // back in for a frame on load.
  if (!loaded) return null;

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
          accessibilityLabel="No habits yet. Add some."
          style={[
            styles.emptyRow,
            { borderColor: t.borderStrong, backgroundColor: t.accentSofter },
          ]}
        >
          <Text variant="subhead" style={{ color: t.accentText }}>
            No habits yet — tap to add some
          </Text>
        </Pressable>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tileRow}
        >
          {enabled.map((habit, index) => {
            const stat = stats.get(habit.key) ?? {
              doneToday: false,
              streak: 0,
              missed: false,
            };
            const busy = saving === habit.key;
            const state = stat.doneToday
              ? "done"
              : stat.missed
                ? "missed"
                : "pending";

            const a11y = stat.doneToday
              ? stat.streak > 0
                ? `${habit.label}, done today, ${stat.streak}-day streak. Tap to undo`
                : `${habit.label}, done today. Tap to undo`
              : stat.missed
                ? `${habit.label}, missed yesterday, streak reset. Log ${habit.label.toLowerCase()} for today`
                : `${habit.label}${
                    stat.streak > 0 ? `, ${stat.streak}-day streak` : ""
                  }. Log ${habit.label.toLowerCase()} for today`;

            return (
              <FadeInUp key={habit.key} index={index}>
                <Pressable
                  onPress={() => handleLog(habit)}
                  disabled={saving !== null}
                  accessibilityRole="button"
                  accessibilityLabel={a11y}
                  accessibilityState={{ selected: stat.doneToday }}
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
                  ) : state === "done" ? null : ( // A no-streak habit (nailcut) that's
                    // already done needs no chip at all — the tick above already
                    // says so, and there's no streak to report under it.
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
        onClose={() => {
          setShowCustomize(false);
          cancelEdit();
        }}
        title="Customize habits"
        subtitle="Add or remove the once-a-day routines on your Today screen. Each keeps its own streak."
        footer={
          <Button
            label="Done"
            variant="primary"
            fullWidth
            onPress={() => {
              setShowCustomize(false);
              cancelEdit();
            }}
          />
        }
      >
        <View style={styles.custList}>
          <SectionHeader title="On Today" />
          {habits.length === 0 ? (
            <Text variant="subhead" tone="subtle" style={styles.custEmptyLine}>
              None yet — add one below.
            </Text>
          ) : (
            habits.map((habit, index) => {
              const stat = stats.get(habit.key);
              const caption = !habitTracksStreak(habit)
                ? stat?.doneToday
                  ? "Done today"
                  : "Not done today"
                : stat?.doneToday
                  ? `Done today · 🔥 ${stat.streak}-day streak`
                  : stat && stat.streak > 0
                    ? `🔥 ${stat.streak}-day streak`
                    : stat?.missed
                      ? "Missed yesterday · streak reset"
                      : "No streak yet";
              const dividerStyle =
                index > 0 && { borderTopColor: t.border, borderTopWidth: StyleSheet.hairlineWidth };

              if (editingKey === habit.key) {
                return (
                  <View key={habit.key} style={[styles.custItem, dividerStyle]}>
                    <View style={styles.custEditForm}>
                      <Input
                        label="Habit name"
                        value={editLabel}
                        onChangeText={setEditLabel}
                        maxLength={30}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={saveEdit}
                      />
                      {habit.custom && (
                        <Text variant="caption" tone="subtle">
                          Renaming starts this habit's streak over — its
                          history is matched by name.
                        </Text>
                      )}
                      <View style={styles.emojiRow}>
                        {HABIT_EMOJI_CHOICES.map((choice) => {
                          const selected = editEmoji === choice;
                          return (
                            <Pressable
                              key={choice}
                              onPress={() => setEditEmoji(choice)}
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                              accessibilityLabel={`Icon ${choice}`}
                              style={({ pressed }) => [
                                styles.emojiChoice,
                                {
                                  width: emojiTileSize,
                                  height: emojiTileSize,
                                  backgroundColor: selected ? t.accent : t.accentSofter,
                                  borderColor: selected ? t.accent : t.borderStrong,
                                  opacity: pressed ? PRESSED_OPACITY : 1,
                                },
                              ]}
                            >
                              <Emoji size={18}>{choice}</Emoji>
                            </Pressable>
                          );
                        })}
                      </View>
                      <View style={styles.formActions}>
                        <Button
                          label="Cancel"
                          variant="ghost"
                          onPress={cancelEdit}
                          style={styles.flex}
                        />
                        <Button
                          label="Save"
                          variant="primary"
                          disabled={!editLabel.trim()}
                          onPress={saveEdit}
                          style={styles.flex}
                        />
                      </View>
                    </View>
                  </View>
                );
              }

              return (
                <View
                  key={habit.key}
                  style={[styles.custItem, dividerStyle]}
                >
                  {/* The identity — icon and name — is what you'd tap to
                      rename, same as an "Add a habit" row below is tapped to
                      add. Reordering and removing stay dedicated icon buttons
                      so they can't be triggered by the same tap. */}
                  <Pressable
                    onPress={() => startEdit(habit)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${habit.label}`}
                    accessibilityHint="Change its name or icon"
                    style={({ pressed }) => [
                      styles.custMidPressable,
                      { opacity: pressed ? PRESSED_OPACITY : 1 },
                    ]}
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
                    <Icon name="edit" size="sm" color={t.textSubtle} />
                  </Pressable>
                  <IconButton
                    icon="chevronUp"
                    label={`Move ${habit.label} up`}
                    variant="ghost"
                    size="sm"
                    disabled={index === 0}
                    onPress={() => moveHabit(habit.key, -1)}
                  />
                  <IconButton
                    icon="chevronDown"
                    label={`Move ${habit.label} down`}
                    variant="ghost"
                    size="sm"
                    disabled={index === habits.length - 1}
                    onPress={() => moveHabit(habit.key, 1)}
                  />
                  <IconButton
                    icon="trash"
                    label={`Remove ${habit.label}`}
                    variant="ghost"
                    size="sm"
                    onPress={() => removeHabit(habit.key)}
                  />
                </View>
              );
            })
          )}
        </View>

        {/* The catalogue can't anticipate every routine — physio exercises,
            eye drops, a particular stretch — so a family can name their own.
            It logs as a generic habit entry carrying that name. */}
        <View style={styles.custForm}>
          <SectionHeader title="Make your own" />
          <Input
            label="Habit name"
            value={newHabitName}
            onChangeText={setNewHabitName}
            placeholder="e.g. Physio exercises"
            maxLength={30}
            returnKeyType="done"
            onSubmitEditing={addCustomHabit}
          />
          <View style={styles.emojiRow}>
            {HABIT_EMOJI_CHOICES.map((choice) => {
              const selected = newHabitEmoji === choice;
              return (
                <Pressable
                  key={choice}
                  onPress={() => setNewHabitEmoji(choice)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Icon ${choice}`}
                  style={({ pressed }) => [
                    styles.emojiChoice,
                    {
                      width: emojiTileSize,
                      height: emojiTileSize,
                      backgroundColor: selected ? t.accent : t.accentSofter,
                      borderColor: selected ? t.accent : t.borderStrong,
                      opacity: pressed ? PRESSED_OPACITY : 1,
                    },
                  ]}
                >
                  <Emoji size={18}>{choice}</Emoji>
                </Pressable>
              );
            })}
          </View>
          <Button
            label="Add this habit"
            variant="secondary"
            fullWidth
            disabled={!newHabitName.trim()}
            onPress={addCustomHabit}
          />
        </View>

        {available.length > 0 && (
          <View style={styles.custList}>
            <SectionHeader title="Add a habit" />
            {available.map((def, index) => (
              <Pressable
                key={def.key}
                onPress={() => addHabit(def)}
                accessibilityRole="button"
                accessibilityLabel={`Add ${def.label}`}
                style={({ pressed }) => [
                  styles.custItem,
                  index > 0 && { borderTopColor: t.border, borderTopWidth: StyleSheet.hairlineWidth },
                  { opacity: pressed ? PRESSED_OPACITY : 1 },
                ]}
              >
                <View style={[styles.custEmoji, { backgroundColor: t.accentSoft }]}>
                  <Emoji size={19}>{def.emoji}</Emoji>
                </View>
                <View style={styles.custMid}>
                  <Text variant="bodyStrong">{def.label}</Text>
                </View>
                <View style={[styles.addBadge, { backgroundColor: t.accentSoft }]}>
                  <Icon name="plus" size="sm" color={t.accentText} />
                </View>
              </Pressable>
            ))}
          </View>
        )}
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
  // The list sections need no gap — their rows carry their own padding and
  // dividers — but a form of stacked controls does, or the heading, field,
  // icons and button run together into one block.
  custForm: { gap: space.md, paddingTop: space.md, paddingBottom: space.lg },
  custEmptyLine: { paddingVertical: space.sm },
  custItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.md,
  },
  // Wraps the icon + name + edit hint of a normal row so the whole identity
  // is one tap target, sized to fill the row alongside the reorder/remove
  // buttons that follow it as siblings.
  custMidPressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    flex: 1,
    minWidth: 0,
  },
  // Replaces a row's content while it's being renamed. `flex: 1` is what
  // makes it fill the row's width — custItem is a row-flex with just this
  // one child, which otherwise sizes to its content instead of stretching.
  custEditForm: { flex: 1, gap: space.md },
  formActions: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1 },
  custEmoji: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  custMid: { flex: 1, minWidth: 0, gap: 1 },
  // Wraps to as many rows as it needs; each choice's size is computed (see
  // emojiTileSize) so the row fills its width exactly instead of a flat 44px
  // leaving a dead gap.
  emojiRow: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  emojiChoice: {
    borderRadius: radius.md,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  addBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
