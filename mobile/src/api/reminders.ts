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
  enabled: boolean;
  lastNotifiedAt: string | null;
  createdAt: string;
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
}): Promise<Reminder> {
  const res = await apiClient.post<Reminder>("/reminders", data);
  return res.data;
}

export async function updateReminder(
  id: number,
  data: {
    label?: string | null;
    enabled?: boolean;
    hours?: number;
    minutes?: number;
  }
): Promise<Reminder> {
  const res = await apiClient.patch<Reminder>(`/reminders/${id}`, data);
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
