/**
 * Reminder types. Every type except "custom" is anchored to an activity: the
 * countdown restarts from the most recent log of `logType` for the baby, so a
 * feed logged by any caregiver resets every caregiver's feed reminder.
 * A "custom" reminder has nothing to watch, so it simply repeats on its
 * interval.
 */
export const REMINDER_TYPES = [
  { value: "feed", logType: "feed", label: "Feed", icon: "🤱" },
  { value: "pump", logType: "pump", label: "Pump", icon: "🍼" },
  { value: "sleep", logType: "sleep", label: "Sleep", icon: "😴" },
  { value: "diaper", logType: "diaper", label: "Diaper", icon: "🩲" },
  { value: "shower", logType: "shower", label: "Shower", icon: "🚿" },
  { value: "vitamin", logType: "vitamin", label: "Vitamin", icon: "💊" },
  { value: "nailcut", logType: "nailcut", label: "Nail Cut", icon: "💅" },
  /**
   * Watches the same "medicine" log type the Habits catalogue already writes
   * — a family logging doses as a habit gets a reminder for that habit rather
   * than a second, disconnected medication concept.
   */
  { value: "medication", logType: "medicine", label: "Medication", icon: "🩹" },
  /**
   * The odd one out: monthly rather than weekly, anchored to the baby's date of
   * birth rather than the calendar, and it goes quiet on its own once the dose
   * for that month is recorded. See shouldFireVaccine.
   */
  { value: "vaccine", logType: null, label: "Vaccine", icon: "💉" },
  { value: "custom", logType: null, label: "Custom", icon: "⏰" },
] as const;

export type ReminderType = (typeof REMINDER_TYPES)[number]["value"];

const BY_VALUE = new Map(REMINDER_TYPES.map((t) => [t.value, t]));

export function isReminderType(value: string): value is ReminderType {
  return BY_VALUE.has(value as ReminderType);
}

export function reminderMeta(value: string) {
  return BY_VALUE.get(value as ReminderType) ?? null;
}

/** The activity a reminder watches, or null if it just repeats. */
export function reminderLogType(value: string): string | null {
  return BY_VALUE.get(value as ReminderType)?.logType ?? null;
}

/* -------------------------------------------------------------------------- */
/* Time of day                                                                */
/* -------------------------------------------------------------------------- */

/** Minutes after midnight, so 0 is 00:00 and 1439 is 23:59. */
export const MIN_TIME_OF_DAY = 0;
export const MAX_TIME_OF_DAY = 24 * 60 - 1;

/** "9:00 AM" — used in the notification body and the reminder list. */
export function formatTimeOfDay(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/**
 * The caregiver's local wall clock at `now`, as minutes after their midnight.
 *
 * Everything about a scheduled reminder is local: 9am means 9am where the
 * parent is, so both the day check and the time check read the same shifted
 * clock rather than the server's.
 */
export function localMinutesOfDay(now: Date, tzOffsetMinutes: number | null): number {
  const local = new Date(now.getTime() + (tzOffsetMinutes ?? 0) * 60_000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

/** The caregiver's local calendar day at `now`, as YYYY-MM-DD. */
export function localDayKey(now: Date, tzOffsetMinutes: number | null): string {
  const local = new Date(now.getTime() + (tzOffsetMinutes ?? 0) * 60_000);
  return local.toISOString().slice(0, 10);
}

/** The caregiver's local calendar month at `now`, as YYYY-MM. */
export function localMonthKey(now: Date, tzOffsetMinutes: number | null): string {
  const local = new Date(now.getTime() + (tzOffsetMinutes ?? 0) * 60_000);
  return local.toISOString().slice(0, 7);
}

/* -------------------------------------------------------------------------- */
/* Days of the week                                                           */
/* -------------------------------------------------------------------------- */

export const WEEKDAY_LABELS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

/**
 * Normalise a chosen set of weekdays for storage.
 *
 * Null and "every day" are the same thing, so both collapse to null — that way
 * a reminder restricted to all seven days doesn't take a different code path
 * from one that was never restricted at all.
 */
export function serialiseDays(days: number[] | null | undefined): string | null {
  if (!days) return null;
  const unique = Array.from(new Set(days.filter((d) => d >= 0 && d <= 6))).sort(
    (a, b) => a - b
  );
  if (unique.length === 0 || unique.length === 7) return null;
  return unique.join(",");
}

export function parseDays(stored: string | null | undefined): number[] | null {
  if (!stored) return null;
  const days = stored
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return days.length > 0 ? days : null;
}

/**
 * Is `now` on a day this reminder is allowed to fire?
 *
 * The comparison happens in the caregiver's local day, not the server's: a
 * "weekdays only" reminder in Cairo must not go quiet at 9pm Friday because it
 * is already Saturday in UTC.
 *
 * Pure and exported so the rule can be tested without a database.
 */
export function isAllowedDay(input: {
  daysOfWeek: string | null;
  tzOffsetMinutes: number | null;
  now: Date;
}): boolean {
  const days = parseDays(input.daysOfWeek);
  if (!days) return true;
  const offset = input.tzOffsetMinutes ?? 0;
  const local = new Date(input.now.getTime() + offset * 60_000);
  return days.includes(local.getUTCDay());
}

/** "Weekdays" / "Sat, Sun" / "Every day" — for the notification and the UI. */
export function formatDays(stored: string | null | undefined): string {
  const days = parseDays(stored);
  if (!days) return "Every day";
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) {
    return "Weekdays";
  }
  if (days.length === 2 && days.includes(0) && days.includes(6)) {
    return "Weekends";
  }
  return days.map((d) => WEEKDAY_LABELS[d]).join(", ");
}

/* -------------------------------------------------------------------------- */
/* Every N days                                                               */
/* -------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;
export const MIN_EVERY_DAYS = 1;
export const MAX_EVERY_DAYS = 60;

/**
 * Is `now` due for an "every N days" reminder?
 *
 * Counted from whenever it last actually fired, not from a fixed origin —
 * self-correcting rather than accumulating drift. A reminder that missed a
 * beat (a dead scheduler, a lost push token) picks its N-day spacing back up
 * from whenever it truly last reached someone, instead of quietly landing on
 * origin+N, origin+2N, … regardless of what actually happened. Falls back to
 * `createdAt` for one that has never fired.
 *
 * Pure and exported so the timing rule can be tested without a database.
 */
export function isDueByInterval(input: {
  everyDays: number;
  createdAt: Date;
  lastNotifiedAt: Date | null;
  tzOffsetMinutes: number | null;
  now: Date;
}): boolean {
  const anchor = input.lastNotifiedAt ?? input.createdAt;
  const anchorDay = Date.parse(localDayKey(anchor, input.tzOffsetMinutes));
  const nowDay = Date.parse(localDayKey(input.now, input.tzOffsetMinutes));
  const diffDays = Math.round((nowDay - anchorDay) / DAY_MS);
  return diffDays >= input.everyDays;
}

/** "Every day" / "Every 3 days" — for the notification and the UI. */
export function formatEveryDays(days: number): string {
  return days === 1 ? "Every day" : `Every ${days} days`;
}
