import { mix, readableOn, isValidHexColor } from "../lib/color";

/**
 * Semantic colour tokens, matched to the web app (toutistracker.vercel.app).
 *
 * The website defines the brand: a rose ramp (`--color-baby-50…600`), white
 * cards with soft shadows on a blush background, and Tailwind's 50-tone pastel
 * pairs for status badges. The mobile palette reproduces those values exactly
 * so the two clients read as one product.
 *
 *   baby-50 #fff5f7 · 100 #ffe0e8 · 200 #ffc2d4 · 300 #ff99b8
 *   baby-400 #ff6b95 · 500 #ff3d72 · 600 #e02060
 */
export interface Palette {
  scheme: "light" | "dark";

  // Surfaces
  bg: string;
  surface: string;
  surfaceAlt: string;
  surfaceSunken: string;
  border: string;
  borderStrong: string;
  scrim: string;

  // Text
  text: string;
  textMuted: string;
  textSubtle: string;
  textInverse: string;

  // Brand accent — the baby-* ramp, or a ramp derived from a custom colour
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentSofter: string;
  onAccent: string;
  accentText: string;

  // Status — the website's badge pairs
  success: string;
  successSoft: string;
  successBorder: string;
  warning: string;
  warningSoft: string;
  warningBorder: string;
  danger: string;
  dangerSoft: string;
  dangerBorder: string;
  info: string;
  infoSoft: string;
  infoBorder: string;
}

const LIGHT_BASE = {
  bg: "#fff5f7", // baby-50, the website's body wash
  surface: "#ffffff",
  surfaceAlt: "#fff5f7",
  surfaceSunken: "#ffeef2",
  border: "#ffe0e8", // baby-100
  borderStrong: "#ffc2d4", // baby-200 — the website's 2px button borders
  scrim: "rgba(0, 0, 0, 0.4)", // website modals use bg-black/40

  text: "#1f2937", // gray-800
  textMuted: "#6b7280", // gray-500
  textSubtle: "#9ca3af", // gray-400
  textInverse: "#ffffff",

  success: "#16a34a",
  successSoft: "#f0fdf4",
  successBorder: "#86efac",
  warning: "#b45309",
  warningSoft: "#fffbeb",
  warningBorder: "#fcd34d",
  danger: "#dc2626",
  dangerSoft: "#fef2f2",
  dangerBorder: "#fca5a5",
  info: "#2563eb",
  infoSoft: "#eff6ff",
  infoBorder: "#93c5fd",
} as const;

const DARK_BASE = {
  bg: "#191114",
  surface: "#221820",
  surfaceAlt: "#2b1e26",
  surfaceSunken: "#140d10",
  border: "#3a2a33",
  borderStrong: "#4d3742",
  scrim: "rgba(0, 0, 0, 0.6)",

  text: "#f4f0f2",
  textMuted: "#b3a8ad",
  textSubtle: "#877b81",
  textInverse: "#1f2937",

  success: "#75e0a7",
  successSoft: "#0a2c1d",
  successBorder: "#12683f",
  warning: "#fec84b",
  warningSoft: "#3a2408",
  warningBorder: "#93370d",
  danger: "#fda29b",
  dangerSoft: "#3b1512",
  dangerBorder: "#7a271a",
  info: "#84caff",
  infoSoft: "#0f2745",
  infoBorder: "#1849a9",
} as const;

/** baby-400 — the website's primary button colour. */
export const DEFAULT_ACCENT = "#ff6b95";

/** The hand-tuned website ramp, used verbatim when the accent is the default. */
const BABY_RAMP = {
  accent: "#ff6b95", // baby-400
  accentHover: "#ff3d72", // baby-500
  accentSoft: "#ffe0e8", // baby-100
  accentSofter: "#fff5f7", // baby-50
  accentText: "#e02060", // baby-600
};

export function buildPalette(
  accentInput: string | null | undefined,
  scheme: "light" | "dark"
): Palette {
  const accentRaw =
    accentInput && isValidHexColor(accentInput) ? accentInput : DEFAULT_ACCENT;
  const isDark = scheme === "dark";
  const base = isDark ? DARK_BASE : LIGHT_BASE;

  // The default rose uses the website's exact hand-tuned ramp; a custom accent
  // derives one with the same tint proportions so it lands in the same register.
  if (!isDark && accentRaw.toLowerCase() === DEFAULT_ACCENT) {
    return { scheme, ...base, ...BABY_RAMP, onAccent: "#ffffff" };
  }

  const accent = isDark ? mix(accentRaw, "#FFFFFF", 0.14) : accentRaw;
  return {
    scheme,
    ...base,
    accent,
    accentHover: isDark ? mix(accent, "#FFFFFF", 0.12) : mix(accent, "#000000", 0.14),
    accentSoft: isDark ? mix(base.surface, accent, 0.22) : mix(accent, "#FFFFFF", 0.82),
    accentSofter: isDark ? mix(base.surface, accent, 0.1) : mix(accent, "#FFFFFF", 0.94),
    onAccent: readableOn(accent),
    accentText: isDark ? mix(accent, "#FFFFFF", 0.3) : mix(accent, "#000000", 0.3),
  };
}
