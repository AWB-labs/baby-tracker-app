import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../design/ThemeProvider";
import { useActivityTones } from "../design/activity";
import { space, radius, DISABLED_OPACITY } from "../design/tokens";
import { Icon } from "../design/icons";
import { Text, Emoji } from "./ui/primitives";
import { useToast } from "./Toast";
import { createLog, type LogEntry } from "../api/logs";

const ACTIONS: { type: "shower" | "vitamin" | "nailcut"; label: string }[] = [
  { type: "shower", label: "Shower" },
  { type: "vitamin", label: "Vitamin" },
  { type: "nailcut", label: "Nail Cut" },
];

interface Props {
  babyId: number;
  logs: LogEntry[];
  enteredByName: string;
  onLogSaved: () => void;
}

/**
 * Once-a-day things. One tap logs them; afterwards the tile stays ticked for
 * the rest of the day so you can see at a glance what's already been done —
 * and can't double-log by tapping again.
 */
export default function DailyActions({
  babyId,
  logs,
  enteredByName,
  onLogSaved,
}: Props) {
  const t = useTheme();
  const tones = useActivityTones();
  const toast = useToast();
  const [saving, setSaving] = useState<string | null>(null);

  const doneToday = useMemo(() => {
    const today = new Date().toDateString();
    const done = new Set<string>();
    for (const log of logs) {
      if (new Date(log.startTime).toDateString() === today) done.add(log.type);
    }
    return done;
  }, [logs]);

  const handlePress = useCallback(
    async (type: string, label: string) => {
      if (saving || doneToday.has(type)) return;
      setSaving(type);
      const now = new Date();
      try {
        await createLog({
          babyId,
          type,
          startTime: now.toISOString(),
          endTime: now.toISOString(),
          enteredByName,
        });
        onLogSaved();
        toast.success(`${label} done.`);
      } catch (err) {
        toast.showError(err);
      } finally {
        setSaving(null);
      }
    },
    [saving, doneToday, babyId, enteredByName, onLogSaved, toast]
  );

  return (
    <View style={styles.row}>
      {ACTIONS.map((action) => {
        const done = doneToday.has(action.type);
        const busy = saving === action.type;
        return (
          <Pressable
            key={action.type}
            onPress={() => handlePress(action.type, action.label)}
            disabled={done || saving !== null}
            accessibilityRole="button"
            accessibilityLabel={
              done
                ? `${action.label}, already done today`
                : `Log ${action.label.toLowerCase()} for today`
            }
            // Announced as "selected" so the tick isn't purely visual.
            accessibilityState={{ selected: done, disabled: done }}
            style={({ pressed }) => [
              styles.tile,
              {
                backgroundColor: done ? t.successSoft : tones[action.type].soft,
                borderColor: done ? t.successBorder : tones[action.type].border,
                opacity: busy ? DISABLED_OPACITY : pressed ? 0.75 : 1,
              },
            ]}
          >
            <Emoji size={24} style={done && styles.doneEmoji}>
              {tones[action.type].emoji}
            </Emoji>
            <Text
              variant="caption"
              style={{ color: done ? t.success : tones[action.type].text }}
              numberOfLines={1}
            >
              {busy ? "Saving…" : action.label}
            </Text>
            {done && (
              <View style={[styles.tick, { backgroundColor: t.success }]}>
                <Icon name="check" size="xs" color={t.textInverse} strokeWidth={3} />
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.sm },
  tile: {
    flex: 1,
    height: 84,
    borderRadius: radius.lg,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
  },
  doneEmoji: { opacity: 0.6 },
  tick: {
    position: "absolute",
    top: space.xs,
    right: space.xs,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
