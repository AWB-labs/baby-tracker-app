/**
 * Colour maths for turning one accent colour into a full palette.
 *
 * Deliberately free of React and React Native imports so the derivation rules
 * can be reasoned about — and tested — on their own.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const to2 = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

/** Blend towards white (amount 1 = white). */
export function tint(rgb: Rgb, amount: number): Rgb {
  return {
    r: rgb.r + (255 - rgb.r) * amount,
    g: rgb.g + (255 - rgb.g) * amount,
    b: rgb.b + (255 - rgb.b) * amount,
  };
}

/** Blend towards black (amount 1 = black). */
export function shade(rgb: Rgb, amount: number): Rgb {
  return {
    r: rgb.r * (1 - amount),
    g: rgb.g * (1 - amount),
    b: rgb.b * (1 - amount),
  };
}

export function isValidHexColor(value: string): boolean {
  return hexToRgb(value) !== null;
}

/** Blend two colours. t=0 returns `a`, t=1 returns `b`. */
export function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca || !cb) return a;
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  });
}

/** Perceived brightness 0–1 (ITU-R BT.601), for picking readable foregrounds. */
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 / 255;
}

/**
 * Black or white, whichever reads better on `background`. Prevents the classic
 * failure of white label text on a light accent like amber.
 */
export function readableOn(background: string): string {
  return luminance(background) > 0.62 ? "#101828" : "#FFFFFF";
}

export interface Palette {
  primary: string;
  primaryLight: string;
  primaryLighter: string;
  background: string;
  accent: string;
  cardBg: string;
  pillText: string;
}

/**
 * Build a whole palette from a single accent colour.
 *
 * The tint ratios match the hand-picked girl/boy themes, so a custom colour
 * lands in the same visual register rather than looking like a different app.
 * `pillText` is darkened because the accent itself is too light to read as text
 * on its own tinted background.
 */
export function derivePalette(hex: string): Palette | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const lighter = rgbToHex(tint(rgb, 0.94));
  return {
    primary: rgbToHex(rgb),
    primaryLight: rgbToHex(tint(rgb, 0.8)),
    primaryLighter: lighter,
    background: lighter,
    accent: rgbToHex(shade(rgb, 0.14)),
    cardBg: "#ffffff",
    pillText: rgbToHex(shade(rgb, 0.32)),
  };
}
