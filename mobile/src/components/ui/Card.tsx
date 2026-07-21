import React from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useThemeContext } from "../../design/ThemeProvider";
import { space, radius, elevation, type ElevationLevel } from "../../design/tokens";

export interface CardProps {
  children: React.ReactNode;
  /** One shared elevation ramp — never a bespoke shadow. */
  level?: ElevationLevel;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  tone?: "surface" | "alt" | "sunken";
  /**
   * Group the card's contents into a single screen-reader stop. Useful when the
   * parts only make sense read together ("Last feed: 2h ago, Left").
   */
  accessible?: boolean;
  accessibilityLabel?: string;
}

export function Card({
  children,
  level = 1,
  padded = true,
  style,
  tone = "surface",
  accessible,
  accessibilityLabel,
}: CardProps) {
  const { theme: t, isDark } = useThemeContext();
  const bg = { surface: t.surface, alt: t.surfaceAlt, sunken: t.surfaceSunken }[tone];

  return (
    <View
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.card,
        {
          backgroundColor: bg,
          // Shadows barely register on dark surfaces, so dark mode separates
          // cards with a visible border instead of pretending depth.
          borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
          borderColor: t.border,
          padding: padded ? space.lg : 0,
        },
        elevation(level, isDark),
        style,
      ]}
    >
      {children}
    </View>
  );
}

export interface PressableCardProps extends CardProps {
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  disabled?: boolean;
}

export function PressableCard({
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  disabled,
  level = 1,
  padded = true,
  style,
  tone = "surface",
}: PressableCardProps) {
  const { theme: t, isDark } = useThemeContext();
  const bg = { surface: t.surface, alt: t.surfaceAlt, sunken: t.surfaceSunken }[tone];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      android_ripple={{ color: t.surfaceAlt }}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed && !isDark ? t.surfaceAlt : bg,
          borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
          borderColor: pressed && isDark ? t.borderStrong : t.border,
          padding: padded ? space.lg : 0,
          opacity: pressed ? 0.96 : 1,
        },
        elevation(level, isDark),
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    overflow: "hidden",
  },
});
