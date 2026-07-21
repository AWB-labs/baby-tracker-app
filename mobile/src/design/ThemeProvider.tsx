import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AccessibilityInfo,
  useColorScheme as useSystemColorScheme,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { buildPalette, DEFAULT_ACCENT, type Palette } from "./palette";

const APPEARANCE_KEY = "babytracker_appearance";

export type Appearance = "system" | "light" | "dark";

interface ThemeContextValue {
  theme: Palette;
  isDark: boolean;
  /** What the user picked, which may be "system". */
  appearance: Appearance;
  setAppearance: (next: Appearance) => void;
  /** True when the OS asks for less animation (skill: reduced-motion). */
  reduceMotion: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme();

  // Follows the OS by default. Every screen now resolves its colours from the
  // palette, so a phone in dark mode gets a dark app without anyone opting in.
  const [appearance, setAppearanceState] = useState<Appearance>("system");
  const [reduceMotion, setReduceMotion] = useState(false);

  // Appearance is stored on the device, not the account: it belongs to the
  // phone you're holding at 3am, not to your profile on every device.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(APPEARANCE_KEY)
      .then((saved) => {
        if (!cancelled && (saved === "light" || saved === "dark" || saved === "system")) {
          setAppearanceState(saved);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled) setReduceMotion(enabled);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion
    );
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const setAppearance = useCallback((next: Appearance) => {
    setAppearanceState(next);
    AsyncStorage.setItem(APPEARANCE_KEY, next).catch(() => {});
  }, []);

  const isDark =
    appearance === "system" ? systemScheme === "dark" : appearance === "dark";

  // One brand colour, everywhere. Per-account and per-baby accents used to be
  // configurable; they made the product feel inconsistent between caregivers
  // looking at the same baby, so the rose ramp is now fixed.
  const theme = useMemo(
    () => buildPalette(DEFAULT_ACCENT, isDark ? "dark" : "light"),
    [isDark]
  );

  const value = useMemo(
    () => ({ theme, isDark, appearance, setAppearance, reduceMotion }),
    [theme, isDark, appearance, setAppearance, reduceMotion]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeContext must be used inside ThemeProvider");
  return ctx;
}

/** The palette. The common case, so it gets the short name. */
export function useTheme(): Palette {
  return useThemeContext().theme;
}

export function useReduceMotion(): boolean {
  return useThemeContext().reduceMotion;
}
