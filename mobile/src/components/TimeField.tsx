import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme, useThemeContext } from "../design/ThemeProvider";
import { space, radius, PRESSED_OPACITY } from "../design/tokens";
import { Field, Text } from "./ui";
import { TIME_LOCALE } from "../lib/calendar";

function formatTimeDisplay(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

interface Props {
  label: string;
  value: Date;
  onChange: (next: Date) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * A time-of-day field, picked per platform rather than one picker forced
 * onto both.
 *
 * The complaint this replaced ("the time picker is flaky") traced to the old
 * spinner: every manual-entry and edit sheet renders its content inside a
 * ScrollView, and an inline spinner is itself a natively-scrolling view —
 * nested one scrollable inside another, both compete for the same vertical
 * drag, and whichever claims the touch first wins, unpredictably. iOS's
 * "compact" display sidesteps that architecturally instead of trying to
 * referee it: it's a small static trigger, and the wheel it opens is a
 * floating popover in its own layer, never a child of this sheet's scroll
 * view. That also removes the open/close state and "Done" button an inline
 * spinner needed — the popover manages its own lifecycle.
 *
 * Android's own dialog was never inline to begin with (mounting it opens it,
 * same as before) — it keeps that shape here, just owning its `open` state
 * locally instead of sharing one keyed by field name with a sibling date
 * picker that no longer has anything to do with time.
 *
 * Reported: a Start time field showing "04:00" (24-hour) beside an End time
 * field on the same sheet showing "10:30 AM" (12-hour) — two mounts of this
 * exact component disagreeing with each other. Without an explicit `locale`,
 * iOS's compact picker resolves its own hour-cycle per instance rather than
 * once for the app, and two instances mounted together can each land on a
 * different answer. Pinning `locale` to the same resolved string every date
 * picker already uses removes the ambiguity — there's nothing left for either
 * instance to resolve independently.
 */
export default function TimeField({ label, value, onChange, style }: Props) {
  const t = useTheme();
  const { isDark } = useThemeContext();
  const [open, setOpen] = useState(false);

  if (Platform.OS === "ios") {
    return (
      <Field label={label} style={style}>
        <DateTimePicker
          value={value}
          mode="time"
          display="compact"
          locale={TIME_LOCALE}
          accentColor={t.accent}
          themeVariant={isDark ? "dark" : "light"}
          onChange={(_, picked) => {
            if (picked) onChange(picked);
          }}
        />
      </Field>
    );
  }

  return (
    <Field label={label} style={style}>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatTimeDisplay(value)}`}
        style={({ pressed }) => [
          styles.btn,
          {
            backgroundColor: t.accentSofter,
            borderColor: t.borderStrong,
            opacity: pressed ? PRESSED_OPACITY : 1,
          },
        ]}
      >
        <Text variant="body">{formatTimeDisplay(value)}</Text>
      </Pressable>
      {open && (
        <DateTimePicker
          value={value}
          mode="time"
          display="default"
          // Left unset, Android's TimePickerDialog falls back to the device's
          // system 24-hour setting — forced off so it always shows AM/PM,
          // matching the closed field's own label above.
          is24Hour={false}
          onChange={(_, picked) => {
            setOpen(false);
            if (picked) onChange(picked);
          }}
        />
      )}
    </Field>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radius.md,
    borderWidth: 2,
    paddingHorizontal: space.md,
    minHeight: 48,
    justifyContent: "center",
  },
});
