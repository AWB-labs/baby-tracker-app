import { useMemo } from "react";
import { mix } from "../lib/color";
import { useThemeContext } from "./ThemeProvider";

/**
 * Per-activity identity, copied from the website.
 *
 * The web app gives every activity an emoji and a pastel badge pair (blue for
 * volumes, amber for nappies, rose for health…), and that's what makes its log
 * feel alive rather than monochrome. The mobile app uses the same emoji and the
 * same Tailwind 50-tone pairs, so an entry looks identical on both clients.
 *
 * Emoji here are *content* — the product's established visual language — and
 * every use sits beside a real text label, never alone as a control.
 */
export type ActivityKey =
  | "feed"
  | "pump"
  | "sleep"
  | "diaper"
  | "shower"
  | "vitamin"
  | "nailcut"
  | "growth"
  | "health";

export interface ActivityTone {
  emoji: string;
  /** The hue itself — bars, emphasis, live indicators. */
  main: string;
  /** Pastel fill behind the emoji or a badge (the website's *-50). */
  soft: string;
  /** Readable text on `soft` (the website's *-600/700). */
  text: string;
  /** Border for outlined tiles (the website's *-200/300). */
  border: string;
}

const LIGHT: Record<ActivityKey, ActivityTone> = {
  feed: { emoji: "🤱", main: "#ff6b95", soft: "#ffe0e8", text: "#e02060", border: "#ffc2d4" },
  pump: { emoji: "🍼", main: "#3b82f6", soft: "#eff6ff", text: "#2563eb", border: "#bfdbfe" },
  sleep: { emoji: "😴", main: "#6366f1", soft: "#eef2ff", text: "#4f46e5", border: "#c7d2fe" },
  diaper: { emoji: "🩲", main: "#f59e0b", soft: "#fffbeb", text: "#b45309", border: "#fde68a" },
  shower: { emoji: "🚿", main: "#06b6d4", soft: "#ecfeff", text: "#0e7490", border: "#a5f3fc" },
  vitamin: { emoji: "💊", main: "#22c55e", soft: "#f0fdf4", text: "#16a34a", border: "#bbf7d0" },
  nailcut: { emoji: "💅", main: "#8b5cf6", soft: "#f5f3ff", text: "#7c3aed", border: "#ddd6fe" },
  growth: { emoji: "📏", main: "#a855f7", soft: "#faf5ff", text: "#9333ea", border: "#e9d5ff" },
  health: { emoji: "🩺", main: "#f43f5e", soft: "#fff1f2", text: "#be123c", border: "#fecdd3" },
};

const NEUTRAL: ActivityTone = {
  emoji: "❓",
  main: "#9ca3af",
  soft: "#f3f4f6",
  text: "#6b7280",
  border: "#e5e7eb",
};

const DARK_SURFACE = "#221820";
const darkCache = new Map<string, ActivityTone>();

function darken(tone: ActivityTone): ActivityTone {
  const cached = darkCache.get(tone.emoji);
  if (cached) return cached;
  const dark: ActivityTone = {
    emoji: tone.emoji,
    main: mix(tone.main, "#FFFFFF", 0.25),
    soft: mix(DARK_SURFACE, tone.main, 0.2),
    text: mix(tone.main, "#FFFFFF", 0.45),
    border: mix(DARK_SURFACE, tone.main, 0.42),
  };
  darkCache.set(tone.emoji, dark);
  return dark;
}

export function useActivityTones(): Record<ActivityKey, ActivityTone> {
  const { isDark } = useThemeContext();
  return useMemo(() => {
    if (!isDark) return LIGHT;
    return Object.fromEntries(
      Object.entries(LIGHT).map(([k, tone]) => [k, darken(tone)])
    ) as Record<ActivityKey, ActivityTone>;
  }, [isDark]);
}

/** Tone for one activity, with a calm neutral for anything unrecognised. */
export function useActivityTone(type: string): ActivityTone {
  const tones = useActivityTones();
  if (type in tones) return tones[type as ActivityKey];
  return NEUTRAL;
}

/* ------------------------------------------------------------------------- */
/* Shared vocabulary — identical wording and emoji to the website             */
/* ------------------------------------------------------------------------- */

export const ACTIVITY_LABEL: Record<string, string> = {
  feed: "Feed",
  pump: "Pump",
  sleep: "Sleep",
  diaper: "Diaper",
  shower: "Shower",
  vitamin: "Vitamin",
  nailcut: "Nail Cut",
  growth: "Growth",
  health: "Health",
};

export const DIAPER_META: Record<string, { emoji: string; label: string }> = {
  empty: { emoji: "✅", label: "Empty" },
  wet: { emoji: "💧", label: "Wet" },
  dirty: { emoji: "💩", label: "Dirty" },
  wet_and_dirty: { emoji: "💧💩", label: "Wet & Dirty" },
};

export const SIDE_EMOJI = { left: "🫲", right: "🫱" } as const;

export const MEASURE_EMOJI = {
  weight: "⚖️",
  height: "📏",
  fever: "🌡️",
  volume: "🍼",
} as const;

export const CONDITION_META: Record<string, { emoji: string; label: string }> = {
  fever: { emoji: "🌡️", label: "Fever" },
  cold: { emoji: "🤧", label: "Cold" },
  stomach: { emoji: "🤢", label: "Stomach" },
  other: { emoji: "❓", label: "Other" },
};

export const REMINDER_EMOJI: Record<string, string> = {
  feed: "🤱",
  pump: "🍼",
  sleep: "😴",
  diaper: "🩲",
  shower: "🚿",
  vitamin: "💊",
  nailcut: "💅",
  custom: "⏰",
};

export const TAB_EMOJI = {
  Today: "🏠",
  History: "📅",
  Trends: "📊",
  Growth: "📏",
  Health: "🩺",
} as const;
