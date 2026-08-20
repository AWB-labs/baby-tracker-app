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
  | "medicine"
  /** Every family-invented habit; its name is what tells them apart. */
  | "habit";

export interface HabitDef {
  /**
   * Identity within this baby's config. A catalogue habit uses its own type;
   * a custom one gets a generated key, because all custom habits share the
   * single "habit" server type and would otherwise collide. Stays stable
   * across a rename — only `label`/`emoji` change, so a renamed custom habit
   * doesn't need a fresh key.
   */
  key: string;
  /** The server log type a tick is written as. */
  type: HabitType;
  label: string;
  emoji: string;
  enabled: boolean;
  /**
   * A habit the family made up. Its logs are type "habit" and are matched back
   * to it by label, so renaming one starts its streak over — today's tick and
   * any history logged under the old name stop counting toward the new one.
   */
  custom?: boolean;
  /**
   * Set once the family has renamed or re-iconed a catalogue habit by hand.
   * Without this, loadHabits would overwrite that choice with the catalogue
   * default on the very next load, the same way it propagates a shipped
   * rename to everyone who *hasn't* customized theirs.
   */
  edited?: boolean;
}

/** The emoji offered when inventing — or renaming — a habit. Deliberately a
 *  short list: a full picker is a lot of screen for a decision that barely
 *  matters. 💊 covers the common case of a second, differently-named vitamin
 *  or medicine habit alongside the catalogue's own "Vitamin". */
export const HABIT_EMOJI_CHOICES = [
  "⭐", "💊", "🍼", "🧸", "📚", "🎵", "🧴", "🪥", "🚼",
  "💧", "🌙", "🧦", "🩹", "🏃", "🎨", "🫧", "🌿",
];

/**
 * Every habit a family can add, in the order they appear in the "Add a habit"
 * picker. Each `type` is a real server log type (api/src/routes/logs.ts), so a
 * tick syncs across caregivers like any other entry.
 */
export const HABIT_CATALOG: HabitDef[] = [
  { key: "vitamin", type: "vitamin", label: "Vitamin", emoji: "💊", enabled: true },
  { key: "shower", type: "shower", label: "Shower", emoji: "🚿", enabled: true },
  { key: "nailcut", type: "nailcut", label: "Nail Cut", emoji: "💅", enabled: true },
  { key: "tummy", type: "tummy", label: "Tummy Time", emoji: "🤸", enabled: true },
  { key: "sunlight", type: "sunlight", label: "Sunlight", emoji: "☀️", enabled: true },
  { key: "bath", type: "bath", label: "Bath", emoji: "🛁", enabled: true },
  { key: "massage", type: "massage", label: "Massage", emoji: "💆", enabled: true },
  { key: "teeth", type: "teeth", label: "Brush Teeth", emoji: "🪥", enabled: true },
  { key: "walk", type: "walk", label: "Walk", emoji: "🚶", enabled: true },
  { key: "medicine", type: "medicine", label: "Medicine", emoji: "💉", enabled: true },
];

/** What a brand-new baby starts with, before the family customizes. */
export const DEFAULT_HABITS: HabitDef[] = [
  { key: "vitamin", type: "vitamin", label: "Vitamin", emoji: "💊", enabled: true },
  { key: "shower", type: "shower", label: "Shower", emoji: "🚿", enabled: true },
  { key: "nailcut", type: "nailcut", label: "Nail Cut", emoji: "💅", enabled: true },
];

/**
 * Build a family-invented habit.
 *
 * The key is derived from the label rather than randomly, so re-adding a habit
 * someone removed picks its history back up instead of starting a fresh streak
 * beside the old logs.
 */
export function makeCustomHabit(label: string, emoji: string): HabitDef {
  const name = label.trim();
  return {
    key: `custom:${name.toLowerCase()}`,
    type: "habit",
    label: name,
    emoji,
    enabled: true,
    custom: true,
  };
}

/**
 * Apply a rename/re-icon from the edit sheet. The key is left untouched — for
 * a custom habit it's only ever used for local list identity and duplicate
 * detection, never for matching logs (that's `label`), so there's nothing to
 * regenerate.
 */
export function editHabit(habit: HabitDef, label: string, emoji: string): HabitDef {
  return { ...habit, label: label.trim(), emoji, edited: true };
}

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
    // Catalogue entries have their label and emoji refreshed from the catalogue
    // so a shipped rename reaches an existing config, unless the family has
    // edited that entry themselves — that takes precedence and stops the
    // refresh, same as a shipped rename would otherwise clobber it every load.
    // Any catalogue entry whose type has since been withdrawn is dropped.
    // Custom ones are the family's own words and are always passed through
    // untouched.
    return saved
      .map((h): HabitDef | null => {
        if (h.custom) {
          return {
            ...h,
            type: "habit",
            // Configs written before custom habits existed have no key.
            key: h.key || `custom:${h.label.toLowerCase()}`,
          };
        }
        const meta = CATALOG_BY_TYPE.get(h.type);
        if (!meta) return null;
        return h.edited
          ? { ...h, key: h.type }
          : { ...h, key: h.type, label: meta.label, emoji: meta.emoji };
      })
      .filter((h): h is HabitDef => h !== null);
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

/**
 * Habit types where "days in a row" doesn't measure anything real — a nail
 * cut is due every week or two, not daily, so a broken chain of them isn't a
 * habit slipping the way a skipped shower or vitamin is. Ticking one still
 * logs and undoes exactly like any other habit; it just never earns a streak
 * or gets flagged as missed.
 */
const NO_STREAK_TYPES: ReadonlySet<HabitType> = new Set(["nailcut"]);

export function habitTracksStreak(habit: HabitDef): boolean {
  return !NO_STREAK_TYPES.has(habit.type);
}

export function computeHabitStats(
  logs: LogEntry[],
  habit: HabitDef
): HabitStats {
  // Custom habits all share the "habit" type, so the name the family gave it is
  // the only thing separating one streak from another.
  const matches = habit.custom
    ? (log: LogEntry) => log.type === "habit" && log.comments === habit.label
    : (log: LogEntry) => log.type === habit.type;

  const daysWith = new Set<string>();
  for (const log of logs) {
    if (matches(log)) {
      daysWith.add(new Date(log.startTime).toDateString());
    }
  }

  const today = new Date();
  const keyFor = (daysAgo: number) =>
    new Date(today.getTime() - daysAgo * DAY_MS).toDateString();

  const doneToday = daysWith.has(keyFor(0));

  if (!habitTracksStreak(habit)) {
    return { doneToday, streak: 0, missed: false };
  }

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
