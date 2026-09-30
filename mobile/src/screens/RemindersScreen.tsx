import React, { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Switch, View } from "react-native";
import DateTimePicker from "../components/DateTimePicker";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../design/ThemeProvider";
import { space, radius, PRESSED_OPACITY } from "../design/tokens";
import { REMINDER_EMOJI } from "../design/activity";
import { TIME_LOCALE } from "../lib/calendar";
import {
  Screen,
  ScreenHeader,
  Card,
  Text,
  Emoji,
  Button,
  IconButton,
  Input,
  Field,
  EmptyState,
  Chip,
  ChipWrap,
  Segmented,
  Sheet,
  SkeletonList,
  FadeInUp,
  ConfirmDialog,
} from "../components/ui";
import { useBaby } from "../context/BabyContext";
import { useSettings } from "../context/SettingsContext";
import { useToast } from "../components/Toast";
import { usePushRegistration } from "../hooks/usePushRegistration";
import {
  getReminders,
  createReminder,
  updateReminder,
  deleteReminder,
  formatTimeOfDay,
  timeOfDayToDate,
  dateToTimeOfDay,
  DEFAULT_TIME_OF_DAY,
  formatDays,
  formatEveryDays,
  formatEveryMinutes,
  formatTimes,
  timesOf,
  scheduleModeOf,
  MONTHLY_TYPES,
  MIN_EVERY_DAYS,
  MAX_EVERY_DAYS,
  DEFAULT_EVERY_DAYS,
  MIN_EVERY_MINUTES,
  MAX_EVERY_MINUTES,
  DEFAULT_EVERY_MINUTES,
  EVERY_MINUTES_STEP,
  MAX_TIMES_PER_DAY,
  WEEKDAYS,
  REMINDER_TYPES,
  REMINDER_META,
  type Reminder,
  type ReminderType,
} from "../api/reminders";

type ScheduleMode = "days" | "interval" | "hours";

const SCHEDULE_MODE_OPTIONS: { value: ScheduleMode; label: string }[] = [
  { value: "days", label: "Set times" },
  { value: "interval", label: "Every X days" },
  { value: "hours", label: "Every X hours" },
];

/** What each activity's "every few hours" counts from, for the helper text:
 *  "2 hours after the last pump". Custom and vaccine watch no activity. */
const LAST_ACTIVITY: Partial<Record<ReminderType, string>> = {
  feed: "the last feed",
  pump: "the last pump",
  sleep: "the last sleep ends",
  diaper: "the last diaper change",
  shower: "the last shower",
  vitamin: "the last vitamin",
  nailcut: "the last nail cut",
  medication: "the last dose",
};

/** "2", "2.5" — the stepper's number, in hours. */
function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

/** Sorted, deduplicated, never empty. */
function normaliseTimes(times: number[]): number[] {
  const unique = Array.from(new Set(times)).sort((a, b) => a - b);
  return unique.length > 0 ? unique : [DEFAULT_TIME_OF_DAY];
}

/** A sensible next time to offer when "Add another time" is tapped: three
 *  hours after the latest one so far, nudged along past any it would
 *  duplicate. */
function nextFreeTime(times: number[]): number {
  let candidate = (Math.max(...times) + 180) % 1440;
  while (times.includes(candidate)) candidate = (candidate + 60) % 1440;
  return candidate;
}

/** One-tap picks for the times parents actually choose. */
const QUICK_TIMES: { label: string; minutes: number }[] = [
  { label: "7 AM", minutes: 7 * 60 },
  { label: "9 AM", minutes: 9 * 60 },
  { label: "12 PM", minutes: 12 * 60 },
  { label: "3 PM", minutes: 15 * 60 },
  { label: "7 PM", minutes: 19 * 60 },
  { label: "9 PM", minutes: 21 * 60 },
];

interface Draft {
  /** null while adding; the reminder being edited otherwise. */
  editing: Reminder | null;
  type: ReminderType;
  label: string;
  /**
   * Every time of day it fires, in the order they were added — kept unsorted
   * while editing, so a row doesn't jump out from under the wheel mid-spin.
   * Only "Set times" uses more than one; the other schedules use the first.
   */
  times: number[];
  /** Whether `times` is still just the default a new reminder starts with.
   *  The first quick-time tap replaces that default rather than adding to it
   *  — nobody picking "7 AM" meant "7 AM and also 9 AM". */
  timesTouched: boolean;
  /** Which of the three mutually-exclusive schedules is showing — only that
   *  one's settings below are actually sent, based on this. */
  scheduleMode: ScheduleMode;
  days: number[];
  everyDays: number;
  everyMinutes: number;
}

const FRESH_DRAFT: Draft = {
  editing: null,
  type: "feed",
  label: "",
  times: [DEFAULT_TIME_OF_DAY],
  timesTouched: false,
  scheduleMode: "days",
  days: [],
  everyDays: DEFAULT_EVERY_DAYS,
  everyMinutes: DEFAULT_EVERY_MINUTES,
};

/** One line for the list and the toast: "9:00 AM, 3:00 PM · Every day". */
function describeSchedule(r: Reminder): string {
  if (MONTHLY_TYPES.has(r.type)) return `${formatTimeOfDay(r.timeOfDay)} · Monthly`;
  if (r.everyMinutes) {
    const after = LAST_ACTIVITY[r.type];
    return after
      ? `${formatEveryMinutes(r.everyMinutes)} after ${after}`
      : formatEveryMinutes(r.everyMinutes);
  }
  const when = r.everyDays ? formatTimeOfDay(r.timeOfDay) : formatTimes(timesOf(r));
  return `${when} · ${r.everyDays ? formatEveryDays(r.everyDays) : formatDays(r.daysOfWeek)}`;
}

/**
 * Reminders, on their own screen.
 *
 * The old design inlined the whole editor into the Account page — a permanent
 * wall of inputs under the list. Here the screen is the list (what will nudge
 * you, at what time, on which days, each with its own switch), and creating or
 * editing happens in a sheet: pick what → pick when (one tap for the common
 * times, or the wheel for exact) → optionally narrow the days.
 */
export default function RemindersScreen() {
  const t = useTheme();
  const toast = useToast();
  const navigation = useNavigation();
  const { activeBaby } = useBaby();
  const { notificationsEnabled, save } = useSettings();
  const push = usePushRegistration();

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [draft, setDraft] = useState<Draft | null>(null);
  /** Which of the draft's times the exact-time wheel is open on, if any. */
  const [wheelIndex, setWheelIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Reminder | null>(null);

  const load = useCallback(async () => {
    if (!activeBaby) {
      setLoading(false);
      return;
    }
    try {
      setReminders(await getReminders(activeBaby.id));
    } catch (err) {
      toast.showError(err);
    } finally {
      setLoading(false);
    }
  }, [activeBaby, toast]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleNotificationsToggle = async (value: boolean) => {
    try {
      await save({ notificationsEnabled: value });
      toast.success(value ? "Reminders switched on." : "All reminders paused.");
    } catch (err) {
      toast.showError(err);
    }
  };

  const openAdd = () => {
    setWheelIndex(null);
    setDraft({ ...FRESH_DRAFT });
  };

  const openEdit = (r: Reminder) => {
    setWheelIndex(null);
    setDraft({
      editing: r,
      type: r.type,
      label: r.label ?? "",
      times: timesOf(r),
      timesTouched: true,
      scheduleMode: scheduleModeOf(r),
      days: r.daysOfWeek ?? [],
      everyDays: r.everyDays ?? DEFAULT_EVERY_DAYS,
      everyMinutes: r.everyMinutes ?? DEFAULT_EVERY_MINUTES,
    });
  };

  const handleSave = async () => {
    if (!draft || !activeBaby) return;
    if (draft.type === "custom" && !draft.label.trim()) {
      toast.error("Give your custom reminder a name.");
      return;
    }
    setSaving(true);
    // Always all of them, together — the schedule modes are mutually
    // exclusive server-side, and sending only the one that changed would
    // leave a stale value from another mode in place instead of clearing it.
    const times = normaliseTimes(draft.times);
    const cleared = {
      timesOfDay: null,
      daysOfWeek: null,
      everyDays: null,
      everyMinutes: null,
    };
    const schedule = MONTHLY_TYPES.has(draft.type)
      ? { timeOfDay: times[0], ...cleared }
      : draft.scheduleMode === "hours"
        ? { timeOfDay: times[0], ...cleared, everyMinutes: draft.everyMinutes }
        : draft.scheduleMode === "interval"
          ? { timeOfDay: times[0], ...cleared, everyDays: draft.everyDays }
          : {
              timeOfDay: times[0],
              ...cleared,
              timesOfDay: times,
              daysOfWeek: draft.days.length > 0 ? draft.days : null,
            };
    try {
      if (draft.editing) {
        const updated = await updateReminder(draft.editing.id, {
          label: draft.label.trim() || null,
          ...schedule,
        });
        setReminders((prev) =>
          prev.map((r) => (r.id === updated.id ? updated : r))
        );
        toast.success("Reminder updated.");
      } else {
        const created = await createReminder({
          babyId: activeBaby.id,
          type: draft.type,
          label: draft.label.trim() || null,
          ...schedule,
        });
        setReminders((prev) => [...prev, created]);
        const after = LAST_ACTIVITY[created.type];
        toast.success(
          created.everyMinutes
            ? `You'll be reminded ${formatEveryMinutes(created.everyMinutes).toLowerCase()}${
                after ? ` after ${after}` : ""
              }.`
            : `You'll be reminded at ${
                created.everyDays
                  ? formatTimeOfDay(created.timeOfDay)
                  : formatTimes(timesOf(created))
              }${
                created.everyDays
                  ? ` ${formatEveryDays(created.everyDays).toLowerCase()}`
                  : created.daysOfWeek
                    ? ` on ${formatDays(created.daysOfWeek).toLowerCase()}`
                    : " every day"
              }.`
        );
      }
      setDraft(null);
    } catch (err) {
      toast.showError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (reminder: Reminder) => {
    const next = !reminder.enabled;
    setReminders((prev) =>
      prev.map((r) => (r.id === reminder.id ? { ...r, enabled: next } : r))
    );
    try {
      await updateReminder(reminder.id, { enabled: next });
    } catch (err) {
      setReminders((prev) =>
        prev.map((r) =>
          r.id === reminder.id ? { ...r, enabled: reminder.enabled } : r
        )
      );
      toast.showError(err);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setDraft(null);
    const previous = reminders;
    setReminders((prev) => prev.filter((r) => r.id !== target.id));
    try {
      await deleteReminder(target.id);
      toast.success("Reminder removed.");
    } catch (err) {
      setReminders(previous);
      toast.showError(err);
    }
  };

  /*
   * Which parts of the time section apply. Several times a day only on the
   * weekday schedule — an every-N-days or monthly reminder fires once on its
   * day, and every-X-hours has no clock time at all.
   */
  const monthly = !!draft && MONTHLY_TYPES.has(draft.type);
  const hourly = !!draft && !monthly && draft.scheduleMode === "hours";
  const multiTime = !!draft && !monthly && draft.scheduleMode === "days";
  const visibleTimes = draft ? (multiTime ? draft.times : draft.times.slice(0, 1)) : [];

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <View style={styles.headerRow}>
        <IconButton
          icon="chevronLeft"
          label="Back to Account"
          variant="surface"
          onPress={() => navigation.goBack()}
        />
        <ScreenHeader
          title="Reminders"
          subtitle={activeBaby ? `Nudges for ${activeBaby.name}` : undefined}
          style={styles.headerText}
        />
      </View>

      {/* Master switch — everything below obeys it. */}
      <Card>
        <View style={styles.switchRow}>
          <View style={[styles.bellChip, { backgroundColor: t.accentSoft }]}>
            <Emoji size={18}>{notificationsEnabled ? "🔔" : "🔕"}</Emoji>
          </View>
          <View style={styles.rowBody}>
            <Text variant="subheadStrong">Notifications</Text>
            <Text variant="caption" tone="subtle">
              {push && push.status !== "granted"
                ? push.message
                : "Reminders are sent to this device."}
            </Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={handleNotificationsToggle}
            trackColor={{ true: t.accent, false: t.border }}
            thumbColor={t.surface}
            ios_backgroundColor={t.border}
            accessibilityLabel="Notifications"
          />
        </View>
      </Card>

      {loading ? (
        <SkeletonList rows={3} />
      ) : reminders.length === 0 ? (
        <EmptyState
          icon="bell"
          title="No reminders yet"
          body="Add one and we'll nudge you at the time you pick — a 9 AM vitamin, a 7 PM bath, whatever fits."
        />
      ) : (
        <View style={styles.list}>
          {reminders.map((r, index) => {
            const meta = REMINDER_META.get(r.type);
            const name = r.label || meta?.label || r.type;
            const scheduleLabel = describeSchedule(r);
            return (
              <FadeInUp key={r.id} index={index}>
                <Pressable
                  onPress={() => openEdit(r)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit the ${name} reminder — ${scheduleLabel}`}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: t.surface,
                      borderColor: t.border,
                      opacity: pressed ? PRESSED_OPACITY : 1,
                    },
                  ]}
                >
                  <View
                    style={[styles.avatar, { backgroundColor: t.accentSofter }]}
                  >
                    <Emoji size={18}>
                      {REMINDER_EMOJI[r.type] ?? REMINDER_EMOJI.custom}
                    </Emoji>
                  </View>
                  <View style={styles.rowBody}>
                    <Text variant="subheadStrong" numberOfLines={1}>
                      {name}
                    </Text>
                    <Text variant="caption" tone="subtle" tabular numberOfLines={1}>
                      {scheduleLabel}
                    </Text>
                  </View>
                  <Switch
                    value={r.enabled}
                    onValueChange={() => handleToggle(r)}
                    trackColor={{ true: t.accent, false: t.border }}
                    thumbColor={t.surface}
                    ios_backgroundColor={t.border}
                    accessibilityLabel={`${name} reminder on or off`}
                  />
                </Pressable>
              </FadeInUp>
            );
          })}
        </View>
      )}

      <Button
        label="Add reminder"
        icon="plus"
        variant="primary"
        fullWidth
        onPress={openAdd}
      />

      {/* ------------------------------------------------- add / edit sheet */}
      <Sheet
        visible={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.editing ? "Edit reminder" : "New reminder"}
        subtitle={
          draft?.editing ? undefined : "What, at what time, on which days."
        }
        footer={
          <View style={styles.sheetFooter}>
            {draft?.editing ? (
              <Button
                label="Delete"
                variant="danger"
                onPress={() => {
                  // Close this sheet before opening the confirm dialog — two
                  // Modals stacked at once is exactly the kind of thing that
                  // leaves the top one unreachable, depending on platform.
                  setPendingDelete(draft.editing);
                  setDraft(null);
                }}
                style={styles.flex}
              />
            ) : (
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => setDraft(null)}
                style={styles.flex}
              />
            )}
            <Button
              label={draft?.editing ? "Save" : "Add"}
              variant="primary"
              loading={saving}
              onPress={handleSave}
              style={styles.flex}
            />
          </View>
        }
      >
        {draft ? (
          <View style={styles.form}>
            {/* What — locked while editing; the type is the reminder. */}
            {draft.editing ? null : (
              <Field label="Remind me about">
                <ChipWrap>
                  {REMINDER_TYPES.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      emoji={REMINDER_EMOJI[option.value] ?? REMINDER_EMOJI.custom}
                      selected={draft.type === option.value}
                      onPress={() => setDraft({ ...draft, type: option.value })}
                    />
                  ))}
                </ChipWrap>
              </Field>
            )}

            {(draft.type === "custom" || draft.editing) && (
              <Input
                label={draft.type === "custom" ? "Call it" : "Name (optional)"}
                value={draft.label}
                onChangeText={(label) => setDraft({ ...draft, label })}
                placeholder={
                  draft.type === "custom" ? "Tummy time, water, …" : undefined
                }
              />
            )}

            {/* Which schedule mode, before the details that depend on it —
                clock times on chosen days, a plain N-day repeat for something
                like a nail cut, or every few hours counted from the last log.
                Above the time section rather than below it, since "every X
                hours" hides that section: the switch shouldn't move out from
                under the finger that tapped it. */}
            {!monthly && (
              <Field label="How often">
                <Segmented
                  options={SCHEDULE_MODE_OPTIONS}
                  value={draft.scheduleMode}
                  onChange={(scheduleMode) => {
                    setWheelIndex(null);
                    setDraft({ ...draft, scheduleMode });
                  }}
                />
              </Field>
            )}

            {/* When — one tap for the usual times, the wheel for exact. Not
                shown for "every X hours", which has no clock time at all. */}
            {!hourly && (
              <>
                <Field
                  label="At what time"
                  helper={
                    multiTime
                      ? "Tap more than one to be reminded several times a day."
                      : undefined
                  }
                >
                  <ChipWrap>
                    {QUICK_TIMES.map((q) => {
                      const selected = multiTime
                        ? draft.times.includes(q.minutes)
                        : draft.times[0] === q.minutes;
                      return (
                        <Chip
                          key={q.label}
                          label={q.label}
                          selected={selected}
                          onPress={() => {
                            setWheelIndex(null);
                            const touched = { ...draft, timesTouched: true };
                            if (!multiTime) {
                              setDraft({
                                ...touched,
                                times: [q.minutes, ...draft.times.slice(1)],
                              });
                            } else if (!draft.timesTouched) {
                              setDraft({ ...touched, times: [q.minutes] });
                            } else if (!selected) {
                              if (draft.times.length >= MAX_TIMES_PER_DAY) return;
                              setDraft({ ...touched, times: [...draft.times, q.minutes] });
                            } else if (draft.times.length > 1) {
                              // Never down to none — the last one stays.
                              setDraft({
                                ...touched,
                                times: draft.times.filter((m) => m !== q.minutes),
                              });
                            }
                          }}
                        />
                      );
                    })}
                  </ChipWrap>
                </Field>

                {visibleTimes.map((minutes, index) => (
                  <View key={index} style={styles.timeBlock}>
                    <View style={styles.timeLine}>
                      <Pressable
                        onPress={() =>
                          setWheelIndex((open) => (open === index ? null : index))
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`Reminder time: ${formatTimeOfDay(minutes)}. Opens the exact time picker.`}
                        style={({ pressed }) => [
                          styles.timeRow,
                          styles.flex,
                          {
                            backgroundColor: t.accentSofter,
                            borderColor: t.borderStrong,
                            opacity: pressed ? PRESSED_OPACITY : 1,
                          },
                        ]}
                      >
                        <Emoji size={16}>⏰</Emoji>
                        <Text variant="bodyStrong" tabular style={{ color: t.accentText }}>
                          {formatTimeOfDay(minutes)}
                        </Text>
                        <Text variant="caption" tone="subtle">
                          tap for exact time
                        </Text>
                      </Pressable>
                      {visibleTimes.length > 1 && (
                        <IconButton
                          icon="close"
                          label={`Remove ${formatTimeOfDay(minutes)}`}
                          variant="surface"
                          onPress={() => {
                            setWheelIndex(null);
                            setDraft({
                              ...draft,
                              times: draft.times.filter((_, i) => i !== index),
                            });
                          }}
                        />
                      )}
                    </View>

                    {wheelIndex === index && (
                      <DateTimePicker
                        value={timeOfDayToDate(minutes)}
                        mode="time"
                        display={Platform.OS === "ios" ? "spinner" : "default"}
                        locale={TIME_LOCALE}
                        // Left unset on Android, this falls back to the device's
                        // system 24-hour setting — forced off so it always shows
                        // AM/PM, matching the row's own "tap for exact time" label.
                        is24Hour={false}
                        onChange={(_e, date) => {
                          if (Platform.OS !== "ios") setWheelIndex(null);
                          if (date)
                            setDraft((d) =>
                              d
                                ? {
                                    ...d,
                                    timesTouched: true,
                                    times: d.times.map((m, i) =>
                                      i === index ? dateToTimeOfDay(date) : m
                                    ),
                                  }
                                : d
                            );
                        }}
                      />
                    )}
                  </View>
                ))}

                {multiTime && draft.times.length < MAX_TIMES_PER_DAY && (
                  <Button
                    label="Add another time"
                    icon="plus"
                    variant="secondary"
                    fullWidth
                    onPress={() => {
                      const next = nextFreeTime(draft.times);
                      setDraft({
                        ...draft,
                        timesTouched: true,
                        times: [...draft.times, next],
                      });
                      // Straight onto the wheel for it — the guess is only a
                      // starting point.
                      setWheelIndex(draft.times.length);
                    }}
                  />
                )}
              </>
            )}

            {/* A vaccine reminder counts from the baby's date of birth, so
                weekdays don't apply to it — it arrives once a month, on the
                day they reach the next month of age, until that month's dose is
                recorded. */}
            {MONTHLY_TYPES.has(draft.type) ? (
              <Field label="How often" helper="Once a month, at the time above.">
                <Text variant="footnote" tone="subtle">
                  Sent when your baby reaches each new month, and stops for that
                  month as soon as you mark the vaccine as taken. Ends after 12
                  months.
                </Text>
              </Field>
            ) : (
            <>
              {draft.scheduleMode === "hours" ? (
                <Field
                  label="Every how many hours"
                  helper={
                    LAST_ACTIVITY[draft.type]
                      ? `${formatEveryMinutes(draft.everyMinutes)} after ${
                          LAST_ACTIVITY[draft.type]
                        }. Log one late and the next reminder moves with it.`
                      : `${formatEveryMinutes(draft.everyMinutes)}, counted from the last reminder.`
                  }
                >
                  <View style={styles.everyDaysRow}>
                    <IconButton
                      icon="minus"
                      label="Half an hour less"
                      variant="surface"
                      disabled={draft.everyMinutes <= MIN_EVERY_MINUTES}
                      onPress={() =>
                        setDraft({
                          ...draft,
                          everyMinutes: Math.max(
                            MIN_EVERY_MINUTES,
                            draft.everyMinutes - EVERY_MINUTES_STEP
                          ),
                        })
                      }
                    />
                    <View style={styles.everyHoursValue}>
                      <Text
                        variant="title2"
                        tabular
                        style={[styles.everyDaysValue, { color: t.accentText }]}
                      >
                        {formatHours(draft.everyMinutes)}
                      </Text>
                      <Text variant="caption" tone="subtle">
                        {draft.everyMinutes === 60 ? "hour" : "hours"}
                      </Text>
                    </View>
                    <IconButton
                      icon="plus"
                      label="Half an hour more"
                      variant="surface"
                      disabled={draft.everyMinutes >= MAX_EVERY_MINUTES}
                      onPress={() =>
                        setDraft({
                          ...draft,
                          everyMinutes: Math.min(
                            MAX_EVERY_MINUTES,
                            draft.everyMinutes + EVERY_MINUTES_STEP
                          ),
                        })
                      }
                    />
                  </View>
                </Field>
              ) : draft.scheduleMode === "interval" ? (
                <Field
                  label="Every how many days"
                  helper={formatEveryDays(draft.everyDays)}
                >
                  <View style={styles.everyDaysRow}>
                    <IconButton
                      icon="minus"
                      label="One fewer day"
                      variant="surface"
                      disabled={draft.everyDays <= MIN_EVERY_DAYS}
                      onPress={() =>
                        setDraft({
                          ...draft,
                          everyDays: Math.max(MIN_EVERY_DAYS, draft.everyDays - 1),
                        })
                      }
                    />
                    <Text
                      variant="title2"
                      tabular
                      style={[styles.everyDaysValue, { color: t.accentText }]}
                    >
                      {draft.everyDays}
                    </Text>
                    <IconButton
                      icon="plus"
                      label="One more day"
                      variant="surface"
                      disabled={draft.everyDays >= MAX_EVERY_DAYS}
                      onPress={() =>
                        setDraft({
                          ...draft,
                          everyDays: Math.min(MAX_EVERY_DAYS, draft.everyDays + 1),
                        })
                      }
                    />
                  </View>
                </Field>
              ) : (
                /* Which days — nothing selected means every day. */
                <Field
                  label="On these days"
                  helper={
                    draft.days.length === 0
                      ? "Every day. Tap days to narrow it."
                      : formatDays(draft.days)
                  }
                >
                  <View style={styles.dayRow}>
                    {WEEKDAYS.map((day) => {
                      const selected = draft.days.includes(day.value);
                      return (
                        <Pressable
                          key={day.value}
                          onPress={() =>
                            setDraft({
                              ...draft,
                              days: selected
                                ? draft.days.filter((d) => d !== day.value)
                                : [...draft.days, day.value].sort((a, b) => a - b),
                            })
                          }
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={day.long}
                          style={({ pressed }) => [
                            styles.dayTile,
                            {
                              backgroundColor: selected ? t.accent : t.accentSofter,
                              borderColor: selected ? t.accent : "transparent",
                              opacity: pressed ? PRESSED_OPACITY : 1,
                            },
                          ]}
                        >
                          <Text
                            variant="caption"
                            style={{ color: selected ? t.onAccent : t.accentText }}
                          >
                            {day.short}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </Field>
              )}
            </>
            )}
          </View>
        ) : null}
      </Sheet>

      <ConfirmDialog
        visible={pendingDelete !== null}
        icon="bell"
        title="Delete this reminder?"
        message="It stops nudging every caregiver of this baby."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
  },
  headerText: { flex: 1 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  bellChip: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, minWidth: 0, gap: 1 },
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
  form: { gap: space.lg },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  everyDaysRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.lg,
  },
  everyDaysValue: { minWidth: 40, textAlign: "center" },
  everyHoursValue: { alignItems: "center" },
  timeBlock: { gap: space.sm },
  timeLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dayRow: { flexDirection: "row", gap: space.xs },
  dayTile: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  sheetFooter: { flexDirection: "row", gap: space.sm },
});
