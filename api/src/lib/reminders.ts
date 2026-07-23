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

/** "3h 30m" / "45m" — used in the notification body. */
export function formatInterval(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export const MIN_INTERVAL_MINUTES = 5;
export const MAX_INTERVAL_MINUTES = 60 * 24 * 7;

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
