import React, { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "../theme";
import { createLog } from "../api/logs";
import type { LogEntry } from "../api/logs";
import { useToast } from "./Toast";

// Once-a-day quick actions: tap to log, and the tile stays ticked for the rest
// of the day so a second tap can't double-log it.
const DAILY_ACTIONS = [
  { type: "shower", icon: "🚿", label: "Shower" },
  { type: "vitamin", icon: "💊", label: "Vitamin" },
] as const;

interface Props {
  babyId: number;
  logs: LogEntry[];
  enteredByName: string;
  onLogSaved: () => void;
}

export default function DailyActionButtons({
  babyId,
  logs,
  enteredByName,
  onLogSaved,
}: Props) {
  const theme = useTheme();
  const toast = useToast();
  const [savingType, setSavingType] = useState<string | null>(null);

  const isLoggedToday = useCallback(
    (type: string) => {
      const today = new Date().toDateString();
      return logs.some(
        (l) => l.type === type && new Date(l.startTime).toDateString() === today
      );
    },
    [logs]
  );

  const handleLog = useCallback(
    async (type: string) => {
      if (savingType || isLoggedToday(type)) return;
      setSavingType(type);
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
      } catch (err) {
        toast.showError(err);
      } finally {
        setSavingType(null);
      }
    },
    [savingType, isLoggedToday, babyId, enteredByName, onLogSaved, toast]
  );

  return (
    <View style={styles.row}>
      {DAILY_ACTIONS.map((d) => {
        const done = isLoggedToday(d.type);
        return (
          <View key={d.type} style={styles.cell}>
            <TouchableOpacity
              style={[
                styles.tile,
                done
                  ? { borderColor: "#86efac", backgroundColor: "#f0fdf4" }
                  : {
                      borderColor: theme.primaryLight,
                      backgroundColor: theme.primaryLighter,
                    },
                savingType === d.type && { opacity: 0.6 },
              ]}
              onPress={() => handleLog(d.type)}
              disabled={savingType !== null || done}
              activeOpacity={0.7}
              accessibilityLabel={
                done ? `${d.label} logged for today` : `Log ${d.label} for today`
              }
            >
              <View style={[styles.tileInner, done && { opacity: 0.7 }]}>
                <Text style={styles.tileEmoji}>{d.icon}</Text>
                <Text
                  style={[
                    styles.tileLabel,
                    { color: done ? "#16a34a" : theme.pillText },
                  ]}
                >
                  {savingType === d.type ? "Saving..." : d.label}
                </Text>
              </View>
              {done && (
                <View style={styles.tick}>
                  <Text style={styles.tickMark}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12 },
  cell: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  tile: {
    borderWidth: 2,
    borderRadius: 14,
    aspectRatio: 4 / 3,
    alignItems: "center",
    justifyContent: "center",
  },
  tileInner: { alignItems: "center", gap: 4 },
  tileEmoji: { fontSize: 26 },
  tileLabel: { fontSize: 12, fontWeight: "700" },
  tick: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#22c55e",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  tickMark: { color: "#fff", fontSize: 15, fontWeight: "900" },
});
