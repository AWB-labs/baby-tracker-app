import React, { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text as RNText,
  TextProps as RNTextProps,
  View,
  ViewStyle,
  StyleProp,
  TextStyle,
} from "react-native";
import { useTheme, useReduceMotion } from "../../design/ThemeProvider";
import { space, radius, type, tabularNums } from "../../design/tokens";
import { Icon, type IconName } from "../../design/icons";

/* -------------------------------------------------------------------------- */
/* Text                                                                        */
/* -------------------------------------------------------------------------- */

type Variant = keyof typeof type;
type Tone = "default" | "muted" | "subtle" | "accent" | "danger" | "success" | "inverse";

export interface TextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
  /** Digits that don't shift the layout as they tick. */
  tabular?: boolean;
  center?: boolean;
}

export function Text({
  variant = "body",
  tone = "default",
  tabular,
  center,
  style,
  ...rest
}: TextProps) {
  const t = useTheme();
  const color = {
    default: t.text,
    muted: t.textMuted,
    subtle: t.textSubtle,
    accent: t.accentText,
    danger: t.danger,
    success: t.success,
    inverse: t.textInverse,
  }[tone];

  return (
    <RNText
      // Text must grow with the OS setting, but not so far that a timer wraps
      // mid-digit; capping at 1.6 keeps layouts intact while still scaling.
      maxFontSizeMultiplier={1.6}
      style={[
        type[variant] as TextStyle,
        { color },
        tabular && tabularNums,
        center && { textAlign: "center" },
        style,
      ]}
      {...rest}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Emoji — the product's established iconography, rendered accessibly          */
/* -------------------------------------------------------------------------- */

export interface EmojiProps {
  children: string;
  size?: number;
  /**
   * Without a label the emoji is hidden from screen readers — a decoration
   * beside real text. With one it becomes announceable content.
   */
  label?: string;
  style?: StyleProp<TextStyle>;
}

/**
 * Emoji are the website's visual language for activities (🤱 😴 🩲 …), so the
 * app uses them identically. Screen readers would otherwise read them out
 * verbatim ("breast-feeding, medium skin tone"), so they're silenced unless
 * given an explicit label.
 */
export function Emoji({ children, size = 20, label, style }: EmojiProps) {
  return (
    <RNText
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? "yes" : "no-hide-descendants"}
      style={[{ fontSize: size, lineHeight: Math.round(size * 1.3) }, style]}
    >
      {children}
    </RNText>
  );
}

/* -------------------------------------------------------------------------- */
/* Divider                                                                     */
/* -------------------------------------------------------------------------- */

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View
      style={[{ height: StyleSheet.hairlineWidth, backgroundColor: t.border }, style]}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Badge — a small status pill                                                 */
/* -------------------------------------------------------------------------- */

export type BadgeTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info";

export function Badge({
  children,
  tone = "neutral",
  icon,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  icon?: IconName;
}) {
  const t = useTheme();
  const map: Record<BadgeTone, { bg: string; fg: string }> = {
    neutral: { bg: t.surfaceAlt, fg: t.textMuted },
    accent: { bg: t.accentSoft, fg: t.accentText },
    success: { bg: t.successSoft, fg: t.success },
    warning: { bg: t.warningSoft, fg: t.warning },
    danger: { bg: t.dangerSoft, fg: t.danger },
    info: { bg: t.infoSoft, fg: t.info },
  };
  const { bg, fg } = map[tone];

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon && <Icon name={icon} size="xs" color={fg} />}
      <Text variant="caption" style={{ color: fg }}>
        {children}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* SectionHeader                                                               */
/* -------------------------------------------------------------------------- */

export function SectionHeader({
  title,
  action,
  style,
}: {
  title: string;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <Text variant="overline" tone="subtle">
        {title}
      </Text>
      {action}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Skeleton — shown instead of a blocking spinner for >1s loads                 */
/* -------------------------------------------------------------------------- */

export function Skeleton({
  width,
  height = 16,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const reduceMotion = useReduceMotion();
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(0.7);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);

  return (
    <Animated.View
      accessibilityLabel="Loading"
      style={[
        {
          width: width ?? "100%",
          height,
          borderRadius: radius.sm,
          backgroundColor: t.surfaceAlt,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

/** A few stacked skeleton rows, sized like the list they stand in for. */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  const t = useTheme();
  return (
    <View style={{ gap: space.sm }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          style={{
            backgroundColor: t.surface,
            borderRadius: radius.lg,
            padding: space.lg,
            gap: space.sm,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: t.border,
          }}
        >
          <Skeleton width="45%" height={14} />
          <Skeleton width="75%" height={12} />
        </View>
      ))}
    </View>
  );
}

/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    // "center", not "flex-start": inside a row — which is every use — flex-start
    // pins the pill to the TOP of the row instead of centring it against the
    // text beside it. Centre behaves correctly on both axes, and still stops
    // the pill stretching to full width when it sits in a column.
    alignSelf: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.sm,
    minHeight: 20,
  },
});
