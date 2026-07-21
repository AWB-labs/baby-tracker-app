import React, { useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme, useReduceMotion } from "../../design/ThemeProvider";
import {
  space,
  radius,
  motion,
  HIT_SLOP_MIN,
  hitSlop,
  DISABLED_OPACITY,
} from "../../design/tokens";
import { Icon, type IconName } from "../../design/icons";
import { Text } from "./primitives";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconPosition?: "leading" | "trailing";
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

const SIZES: Record<ButtonSize, { height: number; px: number; gap: number }> = {
  // Never below 44: the platform minimum for a reliable tap.
  sm: { height: HIT_SLOP_MIN, px: space.md, gap: space.xs },
  md: { height: 50, px: space.lg, gap: space.sm },
  lg: { height: 56, px: space.xl, gap: space.sm },
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  iconPosition = "leading",
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  accessibilityHint,
}: ButtonProps) {
  const t = useTheme();
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const isDisabled = disabled || loading;
  const dims = SIZES[size];

  // Website button language: solid baby-400 primary; tinted baby-50 fill with
  // a 2px baby-200 border for everything secondary.
  const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: t.accent, fg: t.onAccent, border: "transparent" },
    secondary: { bg: t.accentSofter, fg: t.accentText, border: t.borderStrong },
    ghost: { bg: "transparent", fg: t.accentText, border: "transparent" },
    danger: { bg: t.dangerSoft, fg: t.danger, border: t.dangerBorder },
    success: { bg: t.successSoft, fg: t.success, border: t.successBorder },
  };
  const c = palette[variant];

  // Scale rather than translate: the bounds stay put, so nothing around the
  // button reflows while it's held.
  const press = (to: number) => {
    if (reduceMotion) return;
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      ...motion.springSoft,
    }).start();
  };

  return (
    <Animated.View
      style={[
        fullWidth && { alignSelf: "stretch" },
        { transform: [{ scale }] },
        style,
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={() => press(0.97)}
        onPressOut={() => press(1)}
        disabled={isDisabled}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        // Derived from the label colour: a white ripple is invisible on a pale
        // accent, which is exactly when the accent is light enough to force
        // dark label text.
        android_ripple={{ color: c.fg + "22" }}
        style={({ pressed }) => [
          styles.base,
          {
            height: dims.height,
            paddingHorizontal: dims.px,
            gap: dims.gap,
            backgroundColor: c.bg,
            borderColor: c.border,
            borderWidth: c.border === "transparent" ? 0 : 2,
            opacity: isDisabled ? DISABLED_OPACITY : pressed ? 0.9 : 1,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={c.fg} />
        ) : (
          <>
            {icon && iconPosition === "leading" && (
              <Icon name={icon} size="md" color={c.fg} />
            )}
            <Text
              variant={size === "sm" ? "subheadStrong" : "bodyStrong"}
              style={{ color: c.fg }}
              numberOfLines={1}
            >
              {label}
            </Text>
            {icon && iconPosition === "trailing" && (
              <Icon name={icon} size="md" color={c.fg} />
            )}
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

/* -------------------------------------------------------------------------- */

export interface IconButtonProps {
  icon: IconName;
  onPress: () => void;
  /** Required — an icon-only control is unusable to a screen reader without it. */
  label: string;
  variant?: "surface" | "ghost" | "danger" | "accent";
  size?: "sm" | "md";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon,
  onPress,
  label,
  variant = "ghost",
  size = "md",
  disabled,
  style,
}: IconButtonProps) {
  const t = useTheme();
  const box = size === "sm" ? 36 : HIT_SLOP_MIN;

  const palette = {
    surface: { bg: t.surface, fg: t.textMuted, border: t.border },
    ghost: { bg: "transparent", fg: t.textMuted, border: "transparent" },
    danger: { bg: t.dangerSoft, fg: t.danger, border: "transparent" },
    accent: { bg: t.accentSoft, fg: t.accentText, border: "transparent" },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      // A 36pt box still gets a 44pt effective target through hitSlop.
      hitSlop={size === "sm" ? { top: 6, bottom: 6, left: 6, right: 6 } : hitSlop}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.iconButton,
        {
          width: box,
          height: box,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: palette.border === "transparent" ? 0 : StyleSheet.hairlineWidth,
          opacity: disabled ? DISABLED_OPACITY : pressed ? 0.6 : 1,
        },
        style,
      ]}
    >
      <Icon name={icon} size={size === "sm" ? "sm" : "md"} color={palette.fg} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
  },
  iconButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
});
