import apiClient from "./client";

export type ReminderType =
  | "feed"
  | "pump"
  | "sleep"
  | "diaper"
  | "shower"
  | "vitamin"
  | "nailcut"
  | "medication"
  | "vaccine"
  | "custom";

/** Mirrors api/src/lib/reminders.ts. */
export const REMINDER_TYPES: {
  value: ReminderType;
  label: string;
  icon: string;
}[] = [
  { value: "feed", label: "Feed", icon: "🤱" },
  { value: "pump", label: "Pump", icon: "🍼" },
  { value: "sleep", label: "Sleep", icon: "😴" },
  { value: "diaper", label: "Diaper", icon: "🩲" },
  { value: "shower", label: "Shower", icon: "🚿" },
  { value: "vitamin", label: "Vitamin", icon: "💊" },
  { value: "nailcut", label: "Nail Cut", icon: "💅" },
  { value: "medication", label: "Medication", icon: "🩹" },
  { value: "vaccine", label: "Vaccine", icon: "💉" },
  { value: "custom", label: "Custom", icon: "⏰" },
];

/**
 * Types that fire monthly rather than on chosen weekdays.
 *
 * A vaccine reminder counts from the baby's date of birth, so the weekday
 * picker means nothing for it and the form hides it.
 */
export const MONTHLY_TYPES: ReadonlySet<ReminderType> = new Set(["vaccine"]);

export const REMINDER_META = new Map(REMINDER_TYPES.map((t) => [t.value, t]));

export interface Reminder {
  id: number;
  babyId: number;
  type: ReminderType;
  label: string | null;
  /** Minutes after local midnight — 540 is 9:00 AM. */
  timeOfDay: number;
  /** Weekday numbers (0 = Sunday) this may fire on. Null means every day.
   *  Mutually exclusive with `everyDays` — never both set. */
  daysOfWeek: number[] | null;
  /** The other schedule mode: fire every N days instead of on chosen
   *  weekdays. Null means this reminder uses `daysOfWeek` instead. */
  everyDays: number | null;
  tzOffsetMinutes: number | null;
  enabled: boolean;
  lastNotifiedAt: string | null;
  createdAt: string;
}

export const MIN_EVERY_DAYS = 1;
export const MAX_EVERY_DAYS = 60;
/** What a new reminder's "every N days" mode starts at, before it's touched. */
export const DEFAULT_EVERY_DAYS = 2;

export const WEEKDAYS: { value: number; short: string; long: string }[] = [
  { value: 0, short: "Sun", long: "Sunday" },
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
];

/**
 * Minutes to add to UTC to get this device's local time (Cairo → +180).
 *
 * The server stores it alongside the chosen days so "Tuesday" means the
 * caregiver's Tuesday. Note the sign: getTimezoneOffset returns the opposite.
 */
export function localUtcOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

/** "Every day" / "Weekdays" / "Mon, Wed, Fri" */
export function formatDays(days: number[] | null | undefined): string {
  if (!days || days.length === 0 || days.length === 7) return "Every day";
  const set = new Set(days);
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) {
    return "Weekdays";
  }
  if (set.size === 2 && set.has(0) && set.has(6)) return "Weekends";
  return WEEKDAYS.filter((d) => set.has(d.value))
    .map((d) => d.short)
    .join(", ");
}

/** "Every day" / "Every 3 days" */
export function formatEveryDays(days: number): string {
  return days === 1 ? "Every day" : `Every ${days} days`;
}

/** Which of the two mutually-exclusive schedule modes a reminder is in. */
export function scheduleModeOf(r: {
  everyDays: number | null;
}): "days" | "interval" {
  return r.everyDays ? "interval" : "days";
}

export async function getReminders(babyId: number): Promise<Reminder[]> {
  const res = await apiClient.get<Reminder[]>("/reminders", {
    params: { babyId },
  });
  return res.data;
}

export async function createReminder(data: {
  babyId: number;
  type: ReminderType;
  label?: string | null;
  timeOfDay: number;
  daysOfWeek?: number[] | null;
  everyDays?: number | null;
}): Promise<Reminder> {
  const res = await apiClient.post<Reminder>("/reminders", {
    ...data,
    tzOffsetMinutes: localUtcOffsetMinutes(),
  });
  return res.data;
}

export async function updateReminder(
  id: number,
  data: {
    label?: string | null;
    enabled?: boolean;
    timeOfDay?: number;
    daysOfWeek?: number[] | null;
    everyDays?: number | null;
  }
): Promise<Reminder> {
  const res = await apiClient.patch<Reminder>(`/reminders/${id}`, {
    ...data,
    // The offset travels with any change to *when* it fires, since the server
    // reads the time and the schedule on the caregiver's clock.
    ...(data.timeOfDay !== undefined ||
    data.daysOfWeek !== undefined ||
    data.everyDays !== undefined
      ? { tzOffsetMinutes: localUtcOffsetMinutes() }
      : {}),
  });
  return res.data;
}

export async function deleteReminder(id: number): Promise<void> {
  await apiClient.delete(`/reminders/${id}`);
}

/** 540 -> "9:00 AM" */
export function formatTimeOfDay(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** A Date carrying today's date and the reminder's time, for the time picker. */
export function timeOfDayToDate(minutes: number): Date {
  const d = new Date();
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
}

/** The inverse: what the picker gives back, as minutes after midnight. */
export function dateToTimeOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** 9:00 AM — a reasonable default for a new reminder. */
export const DEFAULT_TIME_OF_DAY = 9 * 60;
