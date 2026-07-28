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
export type HabitType =
  | "shower"
  | "vitamin"
  | "nailcut"
  | "tummy"
  | "sunlight"
  | "bath"
  | "massage"
  | "teeth"
  | "walk"
  | "medicine";

export interface HabitDef {
  type: HabitType;
  label: string;
  emoji: string;
  enabled: boolean;
}

/**
 * Every habit a family can add, in the order they appear in the "Add a habit"
 * picker. Each `type` is a real server log type (api/src/routes/logs.ts), so a
 * tick syncs across caregivers like any other entry.
 */
export const HABIT_CATALOG: HabitDef[] = [
  { type: "vitamin", label: "Vitamin", emoji: "💊", enabled: true },
  { type: "shower", label: "Shower", emoji: "🚿", enabled: true },
  { type: "nailcut", label: "Nail Cut", emoji: "💅", enabled: true },
  { type: "tummy", label: "Tummy Time", emoji: "🤸", enabled: true },
  { type: "sunlight", label: "Sunlight", emoji: "☀️", enabled: true },
  { type: "bath", label: "Bath", emoji: "🛁", enabled: true },
  { type: "massage", label: "Massage", emoji: "💆", enabled: true },
  { type: "teeth", label: "Brush Teeth", emoji: "🪥", enabled: true },
  { type: "walk", label: "Walk", emoji: "🚶", enabled: true },
  { type: "medicine", label: "Medicine", emoji: "💉", enabled: true },
];

/** What a brand-new baby starts with, before the family customizes. */
export const DEFAULT_HABITS: HabitDef[] = [
  { type: "vitamin", label: "Vitamin", emoji: "💊", enabled: true },
  { type: "shower", label: "Shower", emoji: "🚿", enabled: true },
  { type: "nailcut", label: "Nail Cut", emoji: "💅", enabled: true },
];

function storageKey(babyId: number): string {
  return `babytracker_habits_${babyId}`;
}

const CATALOG_BY_TYPE = new Map(HABIT_CATALOG.map((h) => [h.type, h]));

export async function loadHabits(babyId: number): Promise<HabitDef[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(babyId));
    if (!raw) return DEFAULT_HABITS;
    const saved: HabitDef[] = JSON.parse(raw);
    if (!Array.isArray(saved)) return DEFAULT_HABITS;
    // Honour the saved list exactly — including habits the family has removed.
    // Only drop types no longer in the catalogue and refresh label/emoji from
    // it, so a shipped rename reaches an existing config without re-adding
    // anything the user took off.
    return saved
      .filter((h) => CATALOG_BY_TYPE.has(h.type))
      .map((h) => {
        const meta = CATALOG_BY_TYPE.get(h.type)!;
        return { ...h, label: meta.label, emoji: meta.emoji };
      });
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
