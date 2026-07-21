import React, { useState } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../../design/ThemeProvider";
import { space, radius, type as typeTokens } from "../../design/tokens";
import { Icon } from "../../design/icons";
import { Text } from "./primitives";

export interface FieldProps {
  label: string;
  /** Persistent guidance. A placeholder disappears the moment typing starts. */
  helper?: string;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Label + helper + error scaffolding, shared by every kind of control. */
export function Field({
  label,
  helper,
  error,
  required,
  children,
  style,
}: FieldProps) {
  const t = useTheme();
  return (
    <View style={[{ gap: space.xs }, style]}>
      <View style={styles.labelRow}>
        <Text variant="subheadStrong" tone="muted">
          {label}
        </Text>
        {required && (
          <Text variant="subheadStrong" style={{ color: t.danger }}>
            *
          </Text>
        )}
      </View>

      {children}

      {/* Errors replace helper text so the two never compete. */}
      {error ? (
        <View
          style={styles.messageRow}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          <Icon name="alert" size="xs" color={t.danger} />
          <Text variant="footnote" style={{ color: t.danger, flex: 1 }}>
            {error}
          </Text>
        </View>
      ) : helper ? (
        <Text variant="footnote" tone="subtle">
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

export interface InputProps extends Omit<TextInputProps, "style"> {
  label: string;
  helper?: string;
  error?: string | null;
  required?: boolean;
  /** Unit shown inside the field, e.g. "kg" or "ml". */
  suffix?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export function Input({
  label,
  helper,
  error,
  required,
  suffix,
  containerStyle,
  onFocus,
  onBlur,
  ...rest
}: InputProps) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? t.danger : focused ? t.accent : t.border;

  return (
    <Field
      label={label}
      helper={helper}
      error={error}
      required={required}
      style={containerStyle}
    >
      <View
        style={[
          styles.inputWrap,
          {
            backgroundColor: t.surfaceAlt,
            borderColor,
            // The focus ring must be clearly visible, not a 1px hint.
            borderWidth: focused || error ? 2 : StyleSheet.hairlineWidth,
          },
        ]}
      >
        <TextInput
          placeholderTextColor={t.textSubtle}
          maxFontSizeMultiplier={1.5}
          accessibilityLabel={label}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, { color: t.text }]}
          {...rest}
        />
        {suffix && (
          <Text variant="subhead" tone="subtle" style={styles.suffix}>
            {suffix}
          </Text>
        )}
      </View>
    </Field>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: "row", alignItems: "center", gap: space.xxs },
  messageRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    // 48 clears the 44pt touch minimum with room for the focus ring.
    minHeight: 48,
  },
  input: {
    flex: 1,
    paddingVertical: space.md,
    ...typeTokens.body,
  },
  suffix: { marginLeft: space.sm },
});
