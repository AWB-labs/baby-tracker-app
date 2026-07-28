import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LogEntry } from "../api/logs";

/**
 * Once-a-day habits, per baby.
 *
 * Which habits show on Today, and in what order, is a personal choice — one
 * family baths in the morning, another doesn't track nail care at all — so the
 * configuration lives on the device, per baby. The logs themselves still go to
 * the server exactly as before (as shower/vitamin/nailcut entries), so a habit
 * ticked by one caregiver reads as done for the other.
 *
 * The set of habit types is bounded by the server's log-type enum. Adding a
 * brand-new type (tummy time, sunlight…) means widening that enum server-side
 * first; the config format here already carries label + emoji per entry so
 * that day needs no migration on the client.
 */
export type HabitType = "shower" | "vitamin" | "nailcut";

export interface HabitDef {
  type: HabitType;
  label: string;
  emoji: string;
  enabled: boolean;
}

export const DEFAULT_HABITS: HabitDef[] = [
  { type: "vitamin", label: "Vitamin", emoji: "💊", enabled: true },
  { type: "shower", label: "Shower", emoji: "🚿", enabled: true },
  { type: "nailcut", label: "Nail Cut", emoji: "💅", enabled: true },
];

function storageKey(babyId: number): string {
  return `babytracker_habits_${babyId}`;
}

export async function loadHabits(babyId: number): Promise<HabitDef[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(babyId));
    if (!raw) return DEFAULT_HABITS;
    const saved: HabitDef[] = JSON.parse(raw);
    if (!Array.isArray(saved)) return DEFAULT_HABITS;
    // Keep saved order and toggles, but let newly-shipped defaults appear.
    const known = new Set(saved.map((h) => h.type));
    const missing = DEFAULT_HABITS.filter((d) => !known.has(d.type));
    return [...saved, ...missing];
  } catch {
    return DEFAULT_HABITS;
  }
}

export async function saveHabits(
  babyId: number,
  habits: HabitDef[]
): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(babyId), JSON.stringify(habits));
  } catch {
    /* ignore */
  }
}

export interface HabitStats {
  doneToday: boolean;
  /**
   * Consecutive days with at least one entry, counted back from today (when
   * done) or from yesterday (when today is still pending). A pending habit
   * with an unbroken run therefore keeps its streak on screen all day.
   */
  streak: number;
  /**
   * True when the chain broke recently: not done today, no run alive as of
   * yesterday, but the habit WAS being done within the last few days. A habit
   * the family never used isn't nagged about.
   */
  missed: boolean;
}

const DAY_MS = 86_400_000;
const MISSED_LOOKBACK_DAYS = 5;

export function computeHabitStats(
  logs: LogEntry[],
  type: HabitType
): HabitStats {
  const daysWith = new Set<string>();
  for (const log of logs) {
    if (log.type === type) {
      daysWith.add(new Date(log.startTime).toDateString());
    }
  }

  const today = new Date();
  const keyFor = (daysAgo: number) =>
    new Date(today.getTime() - daysAgo * DAY_MS).toDateString();

  const doneToday = daysWith.has(keyFor(0));

  let streak = 0;
  let cursor = doneToday ? 0 : 1;
  while (daysWith.has(keyFor(cursor))) {
    streak += 1;
    cursor += 1;
  }

  let recentlyActive = false;
  for (let d = 2; d <= MISSED_LOOKBACK_DAYS; d += 1) {
    if (daysWith.has(keyFor(d))) {
      recentlyActive = true;
      break;
    }
  }
  const missed = !doneToday && streak === 0 && recentlyActive;

  return { doneToday, streak, missed };
}
