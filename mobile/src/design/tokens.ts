import { Platform, TextStyle } from "react-native";

/**
 * Primitive design tokens.
 *
 * Every spacing, radius, size, duration and text style in the app resolves from
 * here. Components must never invent their own numbers — that is what produced
 * the drifting 20/24/28 icon sizes and ad-hoc shadows in the previous UI.
 */

/** 4pt rhythm. Material/Apple both build on multiples of 4. */
export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  giant: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
} as const;

/** Icon sizes as tokens, so stroke and box stay in proportion. */
export const iconSize = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 28,
  xxl: 36,
} as const;

/** One stroke weight across the whole product (skill: stroke-consistency). */
export const iconStroke = {
  regular: 1.75,
  bold: 2.25,
} as const;

/**
 * Minimum interactive size. 44pt is Apple's floor, 48dp Android's; taking the
 * larger keeps one number and satisfies both.
 */
export const HIT_SLOP_MIN = 44;
export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 };

/**
 * Type scale mapped to platform roles. Body is 16 — below that iOS auto-zooms
 * form fields and the text fails the readable-font-size rule.
 */
export const type = {
  display: { fontSize: 34, lineHeight: 41, fontWeight: "800" },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: "800" },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  title3: { fontSize: 18, lineHeight: 24, fontWeight: "700" },
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: "600" },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: "500" },
  subhead: { fontSize: 14, lineHeight: 20, fontWeight: "500" },
  subheadStrong: { fontSize: 14, lineHeight: 20, fontWeight: "700" },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
  overline: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
} as const satisfies Record<string, TextStyle>;

/**
 * Numerals that don't jitter. Timers, volumes and durations change constantly;
 * proportional digits make the surrounding layout twitch on every tick.
 */
export const tabularNums: TextStyle = {
  fontVariant: ["tabular-nums"],
};

/**
 * Motion. Micro-interactions land in 150–300ms; exits run at ~65% of their
 * entrance so dismissal feels responsive rather than sluggish.
 */
export const motion = {
  instant: 100,
  fast: 150,
  base: 220,
  slow: 300,
  exitRatio: 0.65,
  /** Spring for anything the finger drives — feels physical, not mechanical. */
  spring: { damping: 18, stiffness: 220, mass: 0.9 },
  springSoft: { friction: 9, tension: 90 },
} as const;

/** Stagger between list items on entrance (skill: stagger-sequence). */
export const STAGGER_MS = 35;

/**
 * The floating tab bar's geometry, shared with Screen so scroll content always
 * clears it. Lives here because both sides must agree and neither should
 * import the other.
 */
export const tabBar = {
  height: 62,
  /**
   * Inset from the screen edge, applied identically left, right and below, so
   * the pill floats squarely rather than being nudged by whatever safe-area
   * inset the device happens to report.
   */
  margin: 20,
} as const;

export type ElevationLevel = 0 | 1 | 2 | 3;

/**
 * A single elevation ramp. Shadows are near-invisible on dark surfaces, so dark
 * mode leans on border contrast instead — handled by the caller passing the
 * theme's border colour.
 */
export function elevation(level: ElevationLevel, isDark: boolean) {
  if (level === 0 || isDark) {
    return Platform.select({
      ios: {},
      android: { elevation: 0 },
      default: {},
    })!;
  }
  const ramp = {
    1: { offset: 1, radius: 3, opacity: 0.05, android: 1 },
    2: { offset: 3, radius: 8, opacity: 0.07, android: 3 },
    3: { offset: 8, radius: 20, opacity: 0.1, android: 8 },
  }[level];

  return Platform.select({
    ios: {
      shadowColor: "#101828",
      shadowOffset: { width: 0, height: ramp.offset },
      shadowOpacity: ramp.opacity,
      shadowRadius: ramp.radius,
    },
    android: { elevation: ramp.android },
    default: {},
  })!;
}

/** Opacity for disabled controls (Material specifies 0.38). */
export const DISABLED_OPACITY = 0.38;
/** Press feedback opacity — visible but not jarring. */
export const PRESSED_OPACITY = 0.7;
