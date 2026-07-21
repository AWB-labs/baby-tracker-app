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
