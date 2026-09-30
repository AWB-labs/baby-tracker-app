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
  /** Minutes after local midnight — 540 is 9:00 AM. The first of
   *  `timesOfDay` when there are several. */
  timeOfDay: number;
  /** Every time of day it fires, earliest first — just `[timeOfDay]` for a
   *  once-a-day reminder. Only the weekday schedule uses more than one.
   *  Absent from a server that predates several times a day. */
  timesOfDay?: number[] | null;
  /** Weekday numbers (0 = Sunday) this may fire on. Null means every day.
   *  Mutually exclusive with `everyDays` — never both set. */
  daysOfWeek: number[] | null;
  /** The other schedule mode: fire every N days instead of on chosen
   *  weekdays. Null means this reminder uses `daysOfWeek` instead. */
  everyDays: number | null;
  /** The third schedule mode: fire this many minutes after the latest log
   *  of this activity (or after it last fired, or was saved). Null means
   *  one of the other two. Absent from a server that predates it. */
  everyMinutes?: number | null;
  tzOffsetMinutes: number | null;
  enabled: boolean;
  lastNotifiedAt: string | null;
  createdAt: string;
}

/** Mirrors api/src/lib/reminders.ts. */
export const MAX_TIMES_PER_DAY = 12;
export const MIN_EVERY_MINUTES = 30;
export const MAX_EVERY_MINUTES = 24 * 60;
/** What a new "every few hours" reminder starts at, before it's touched. */
export const DEFAULT_EVERY_MINUTES = 2 * 60;
/** How far the hours stepper moves per tap. */
export const EVERY_MINUTES_STEP = 30;

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

/** "Every 2 hours" / "Every 2.5 hours" / "Every 45 min" */
export function formatEveryMinutes(minutes: number): string {
  if (minutes < 60) return `Every ${minutes} min`;
  const hours = minutes / 60;
  if (hours === 1) return "Every hour";
  return `Every ${Number.isInteger(hours) ? hours : hours.toFixed(1)} hours`;
}

/** Every time a reminder fires in a day, earliest first. Never empty. */
export function timesOf(r: {
  timeOfDay: number;
  timesOfDay?: number[] | null;
}): number[] {
  return r.timesOfDay && r.timesOfDay.length > 0 ? r.timesOfDay : [r.timeOfDay];
}

/** "9:00 AM" / "9:00 AM, 3:00 PM" / "7:00 AM + 4 more" */
export function formatTimes(times: number[]): string {
  if (times.length <= 3) return times.map(formatTimeOfDay).join(", ");
  return `${formatTimeOfDay(times[0])} + ${times.length - 1} more`;
}

/** Which of the three mutually-exclusive schedule modes a reminder is in. */
export function scheduleModeOf(r: {
  everyDays: number | null;
  everyMinutes?: number | null;
}): "days" | "interval" | "hours" {
  if (r.everyMinutes) return "hours";
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
  timesOfDay?: number[] | null;
  daysOfWeek?: number[] | null;
  everyDays?: number | null;
  everyMinutes?: number | null;
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
    timesOfDay?: number[] | null;
    daysOfWeek?: number[] | null;
    everyDays?: number | null;
    everyMinutes?: number | null;
  }
): Promise<Reminder> {
  const res = await apiClient.patch<Reminder>(`/reminders/${id}`, {
    ...data,
    // The offset travels with any change to *when* it fires, since the server
    // reads the time and the schedule on the caregiver's clock.
    ...(data.timeOfDay !== undefined ||
    data.timesOfDay !== undefined ||
    data.daysOfWeek !== undefined ||
    data.everyDays !== undefined ||
    data.everyMinutes !== undefined
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
