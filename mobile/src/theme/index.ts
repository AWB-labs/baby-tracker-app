import { useContext } from "react";
import { BabyContext } from "../context/BabyContext";
import { SettingsContext } from "../context/SettingsContext";
import { derivePalette, isValidHexColor } from "../lib/color";

export { isValidHexColor };

export interface Theme {
  primary: string;
  primaryLight: string;
  primaryLighter: string;
  background: string;
  accent: string;
  cardBg: string;
  pillText: string;
}

export const girlTheme: Theme = {
  primary: "#ff6b95",
  primaryLight: "#ffe0e8",
  primaryLighter: "#fff5f7",
  background: "#fff5f7",
  accent: "#ff3d72",
  cardBg: "#ffffff",
  pillText: "#e02060",
};

export const boyTheme: Theme = {
  primary: "#4e9eff",
  primaryLight: "#dceeff",
  primaryLighter: "#f0f7ff",
  background: "#f0f7ff",
  accent: "#1a7de0",
  cardBg: "#ffffff",
  pillText: "#1a6bc8",
};

export const defaultTheme: Theme = girlTheme;

/** A palette the settings screen offers as one-tap choices. */
export const THEME_PRESETS: { label: string; color: string }[] = [
  { label: "Rose", color: "#ff6b95" },
  { label: "Sky", color: "#4e9eff" },
  { label: "Mint", color: "#2bb673" },
  { label: "Lilac", color: "#8b6bff" },
  { label: "Amber", color: "#f59e0b" },
  { label: "Coral", color: "#ff6b4e" },
  { label: "Teal", color: "#14b8a6" },
  { label: "Plum", color: "#c026d3" },
];

/** Build the whole palette from one accent colour; falls back if it's junk. */
export function deriveTheme(hex: string): Theme {
  return derivePalette(hex) ?? defaultTheme;
}

/**
 * Resolution order: the caregiver's own accent, then the baby's, then the
 * gender default. Personal branding wins because it's the setting someone
 * deliberately chose for their own app.
 */
export function useTheme(): Theme {
  const babyCtx = useContext(BabyContext);
  const settingsCtx = useContext(SettingsContext);

  const accountColor = settingsCtx?.themeColor;
  if (accountColor && isValidHexColor(accountColor)) {
    return deriveTheme(accountColor);
  }

  const baby = babyCtx?.activeBaby;
  if (baby?.avatarColor && isValidHexColor(baby.avatarColor)) {
    return deriveTheme(baby.avatarColor);
  }

  return baby?.gender === "boy" ? boyTheme : girlTheme;
}
