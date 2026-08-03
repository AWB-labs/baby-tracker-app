import React, { useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme, useThemeContext } from "../design/ThemeProvider";
import { space, radius, PRESSED_OPACITY } from "../design/tokens";
import { Icon } from "../design/icons";
import { Text } from "./ui/primitives";
import { Field } from "./ui/Input";
import { Button } from "./ui/Button";
import { formatBabyAge } from "../lib/greeting";

interface Props {
  /** ISO date string, or null when it hasn't been given. */
  value: string | null;
  onChange: (dob: string | null) => void;
  label?: string;
}

/** "14 March 2026" — long month, because a slashed date is ambiguous abroad. */
export function formatDob(dob: string | null | undefined): string | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString([], {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * The baby's date of birth.
 *
 * Optional everywhere it appears: a birth date is not always to hand while
 * someone is setting the app up one-handed, and blocking onboarding on it would
 * be the wrong trade. Once set it drives the age shown on the home screen, so
 * the field says what it will produce rather than leaving that a surprise.
 */
export default function DobField({ value, onChange, label = "Date of birth" }: Props) {
  const t = useTheme();
  const { isDark } = useThemeContext();
  const [showPicker, setShowPicker] = useState(false);

  const parsed = value ? new Date(value) : null;
  const valid = parsed && !isNaN(parsed.getTime()) ? parsed : null;
  const age = formatBabyAge(value);
  // Held steady across renders, not recomputed as `new Date()` on every one —
  // before a date is chosen, any unrelated re-render (a keystroke in the name
  // field above, anything) would otherwise hand the inline calendar a
  // slightly newer "now" each time, snapping its displayed month back to the
  // current one mid-navigation. That's what "won't let me pick a past month"
  // actually was.
  const fallbackToday = useRef(new Date()).current;

  return (
    <Field
      label={label}
      helper={
        valid
          ? age
            ? `${age} — shown on the home screen.`
            : undefined
          : "Optional. Adding it shows your baby's age as they grow."
      }
    >
      <View style={styles.row}>
        <Pressable
          onPress={() => setShowPicker(true)}
          accessibilityRole="button"
          accessibilityLabel={
            valid ? `Date of birth: ${formatDob(value)}` : "Set a date of birth"
          }
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: t.accentSofter,
              borderColor: t.borderStrong,
              opacity: pressed ? PRESSED_OPACITY : 1,
            },
          ]}
        >
          <Icon name="calendar" size="sm" color={t.accentText} />
          <Text variant="body" style={{ color: valid ? t.text : t.textSubtle }}>
            {formatDob(value) ?? "Choose a date"}
          </Text>
        </Pressable>

        {valid && (
          <Pressable
            onPress={() => onChange(null)}
            accessibilityRole="button"
            accessibilityLabel="Clear the date of birth"
            style={({ pressed }) => [
              styles.clear,
              { borderColor: t.border, opacity: pressed ? PRESSED_OPACITY : 1 },
            ]}
          >
            <Icon name="close" size="sm" color={t.textSubtle} />
          </Pressable>
        )}
      </View>

      {showPicker && (
        <View style={styles.pickerWrap}>
          <DateTimePicker
            value={valid ?? fallbackToday}
            mode="date"
            // "spinner" was a wheel nested inside this screen's own outer
            // ScrollView — both vertical, both wanting the same drag, so a
            // scroll and a wheel-turn fought over every touch. "inline" is a
            // calendar grid: taps and its own left/right month swipe don't
            // compete with a vertical parent scroll the way a wheel did.
            display={Platform.OS === "ios" ? "inline" : "default"}
            accentColor={t.accent}
            themeVariant={isDark ? "dark" : "light"}
            // Nobody is born tomorrow, and a future date would render a
            // negative age everywhere it's shown.
            maximumDate={new Date()}
            onChange={(event, d) => {
              // Android reports the dismissal itself; without this, backing
              // out of the dialog silently sets today's date. iOS's inline
              // calendar never dismisses on its own — see the Done button.
              if (Platform.OS !== "ios") setShowPicker(false);
              if (event.type === "dismissed") {
                setShowPicker(false);
                return;
              }
              if (d) onChange(d.toISOString());
            }}
          />
          {Platform.OS === "ios" && (
            <Button
              label="Done"
              variant="secondary"
              fullWidth
              onPress={() => setShowPicker(false)}
            />
          )}
        </View>
      )}
    </Field>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  pickerWrap: { gap: space.sm },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    height: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: 2,
  },
  clear: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
});
