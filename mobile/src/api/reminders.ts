import apiClient from "./client";

export type ReminderType =
  | "feed"
  | "pump"
  | "sleep"
  | "diaper"
  | "shower"
  | "vitamin"
  | "nailcut"
  | "custom";

/** Mirrors api/src/lib/reminders.ts. */
export const REMINDER_TYPES: {
  value: ReminderType;
  label: string;
  icon: string;
  /** Null means the reminder simply repeats rather than watching an activity. */
  watchesActivity: boolean;
}[] = [
  { value: "feed", label: "Feed", icon: "🤱", watchesActivity: true },
  { value: "pump", label: "Pump", icon: "🍼", watchesActivity: true },
  { value: "sleep", label: "Sleep", icon: "😴", watchesActivity: true },
  { value: "diaper", label: "Diaper", icon: "🩲", watchesActivity: true },
  { value: "shower", label: "Shower", icon: "🚿", watchesActivity: true },
  { value: "vitamin", label: "Vitamin", icon: "💊", watchesActivity: true },
  { value: "nailcut", label: "Nail Cut", icon: "💅", watchesActivity: true },
  { value: "custom", label: "Custom", icon: "⏰", watchesActivity: false },
];

export const REMINDER_META = new Map(REMINDER_TYPES.map((t) => [t.value, t]));

export interface Reminder {
  id: number;
  babyId: number;
  type: ReminderType;
  label: string | null;
  intervalMinutes: number;
  /** Weekday numbers (0 = Sunday) this may fire on. Null means every day. */
  daysOfWeek: number[] | null;
  tzOffsetMinutes: number | null;
  enabled: boolean;
  lastNotifiedAt: string | null;
  createdAt: string;
}

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
  hours: number;
  minutes: number;
  daysOfWeek?: number[] | null;
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
    hours?: number;
    minutes?: number;
    daysOfWeek?: number[] | null;
  }
): Promise<Reminder> {
  const res = await apiClient.patch<Reminder>(`/reminders/${id}`, {
    ...data,
    ...(data.daysOfWeek !== undefined
      ? { tzOffsetMinutes: localUtcOffsetMinutes() }
      : {}),
  });
  return res.data;
}

export async function deleteReminder(id: number): Promise<void> {
  await apiClient.delete(`/reminders/${id}`);
}

/** 195 -> "3h 15m" */
export function formatInterval(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}
