import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../../design/ThemeProvider";
import {
  space,
  radius,
  hitSlop,
  HIT_SLOP_MIN,
  DISABLED_OPACITY,
} from "../../design/tokens";
import { Icon, type IconName } from "../../design/icons";
import { Text, Emoji } from "./primitives";

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
  /** Website-style pills lead with the activity's emoji. */
  emoji?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A filter or single-choice pill. */
export function Chip({
  label,
  selected = false,
  onPress,
  icon,
  emoji,
  disabled,
  style,
}: ChipProps) {
  const t = useTheme();
  const fg = selected ? t.onAccent : t.accentText;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      // "selected" is what a screen reader announces for a chosen filter;
      // colour alone would say nothing.
      accessibilityState={{ selected, disabled: !!disabled }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        {
          // Website filter pills: bg-baby-50 resting, solid baby-400 selected.
          backgroundColor: selected ? t.accent : t.accentSofter,
          borderColor: selected ? t.accent : t.accentSofter,
          opacity: disabled ? DISABLED_OPACITY : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {emoji ? (
        <Emoji size={14}>{emoji}</Emoji>
      ) : icon ? (
        <Icon name={icon} size="sm" color={fg} />
      ) : null}
      <Text variant="subheadStrong" style={{ color: fg }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Horizontally scrolling chip row that doesn't clip its focus ring. */
export function ChipRow({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, style]}
    >
      {children}
    </ScrollView>
  );
}

/** Wrapping chip grid, for when every option should be visible at once. */
export function ChipWrap({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.wrap, style]}>{children}</View>;
}

/* -------------------------------------------------------------------------- */

export interface SegmentedProps<T extends string> {
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (value: T) => void;
  /**
   * Blocks input while a change is in flight. A wrapping `pointerEvents="none"`
   * would look the same but stay silent to a screen reader, which would then
   * announce a control that does nothing.
   */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Two-to-three way switch — clearer than chips when the options are exclusive. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  style,
}: SegmentedProps<T>) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.segmented,
        {
          backgroundColor: t.surfaceAlt,
          borderColor: t.border,
          opacity: disabled ? DISABLED_OPACITY : 1,
        },
        style,
      ]}
      accessibilityRole="tablist"
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            disabled={disabled}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={opt.label}
            style={[
              styles.segment,
              selected && {
                backgroundColor: t.surface,
                borderColor: t.border,
                borderWidth: StyleSheet.hairlineWidth,
              },
            ]}
          >
            {opt.icon && (
              <Icon
                name={opt.icon}
                size="sm"
                color={selected ? t.accentText : t.textSubtle}
              />
            )}
            <Text
              variant="subheadStrong"
              style={{ color: selected ? t.text : t.textSubtle }}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    // 36 + hitSlop clears the 44pt minimum without a chunky pill.
    height: 36,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: { gap: space.sm, paddingVertical: space.xxs, paddingRight: space.lg },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  segmented: {
    flexDirection: "row",
    padding: space.xxs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.xxs,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    // Segments sit edge to edge, so hitSlop would overlap the neighbour — the
    // box itself has to clear the 44pt minimum.
    height: HIT_SLOP_MIN,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
});
