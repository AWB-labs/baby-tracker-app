import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../design/ThemeProvider";
import { useActivityTone } from "../design/activity";
import { space, radius, elevation, hitSlop } from "../design/tokens";
import { Icon } from "../design/icons";
import { Text, Emoji } from "./ui/primitives";
import { useToast } from "./Toast";
import { createLog, type LogEntry } from "../api/logs";

/** Sundays and Wednesdays — the website's nail-cut cadence. */
const REMINDER_DAYS = [0, 3];

interface Props {
  babyId: number;
  logs: LogEntry[];
  enteredByName: string;
  onLogSaved: () => void;
}

/**
 * The website's violet nail-cut nudge, ported: a soft strip with a one-tap
 * check button. It vanishes for the day the moment it's handled, so it never
 * becomes wallpaper.
 */
export default function NailCutBanner({
  babyId,
  logs,
  enteredByName,
  onLogSaved,
}: Props) {
  const t = useTheme();
  const tone = useActivityTone("nailcut");
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const handleDone = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    const now = new Date();
    try {
      await createLog({
        babyId,
        type: "nailcut",
        startTime: now.toISOString(),
        endTime: now.toISOString(),
        enteredByName,
      });
      onLogSaved();
      toast.success("Nail cut logged.");
    } catch (err) {
      toast.showError(err);
    } finally {
      setSaving(false);
    }
  }, [saving, babyId, enteredByName, onLogSaved, toast]);

  if (!REMINDER_DAYS.includes(new Date().getDay())) return null;

  const today = new Date().toDateString();
  const doneToday = logs.some(
    (l) => l.type === "nailcut" && new Date(l.startTime).toDateString() === today
  );
  if (doneToday) return null;

  return (
    <View
      style={[styles.banner, { backgroundColor: tone.soft }]}
      accessibilityRole="summary"
    >
      <Emoji size={16}>💅</Emoji>
      <Text variant="subhead" tone="muted" style={styles.text}>
        Time to{" "}
        <Text variant="subheadStrong" style={{ color: tone.text }}>
          cut the nails
        </Text>
      </Text>
      <Pressable
        onPress={handleDone}
        disabled={saving}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityLabel="Mark nail cut as done"
        style={({ pressed }) => [
          styles.checkBtn,
          { backgroundColor: t.surface, opacity: pressed || saving ? 0.6 : 1 },
          elevation(1, false),
        ]}
      >
        {saving ? (
          <ActivityIndicator size="small" color={tone.main} />
        ) : (
          <Icon name="check" size="md" color={tone.main} strokeWidth={3} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderRadius: radius.lg,
    paddingLeft: space.lg,
    paddingRight: space.sm,
    paddingVertical: space.sm,
  },
  text: { flex: 1 },
  checkBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
