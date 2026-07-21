import React, { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { createLog } from "../api/logs";
import type { LogEntry } from "../api/logs";
import { useToast } from "./Toast";

// Reminder cadence: Sundays (0) and Wednesdays (3).
const REMINDER_DAYS = [0, 3];

interface Props {
  babyId: number;
  logs: LogEntry[];
  enteredByName: string;
  onLogSaved: () => void;
}

export default function NailCutBanner({
  babyId,
  logs,
  enteredByName,
  onLogSaved,
}: Props) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const handleCheck = useCallback(async () => {
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

  // Only nag on the reminder days.
  if (!REMINDER_DAYS.includes(new Date().getDay())) return null;

  // Once it's been logged today the reminder is handled — hide it for the day.
  const today = new Date().toDateString();
  const doneToday = logs.some(
    (l) => l.type === "nailcut" && new Date(l.startTime).toDateString() === today
  );
  if (doneToday) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        💅 Time to <Text style={styles.bold}>cut the nails</Text>
      </Text>
      <TouchableOpacity
        style={[styles.checkBtn, saving && { opacity: 0.5 }]}
        onPress={handleCheck}
        disabled={saving}
        activeOpacity={0.7}
        accessibilityLabel="Mark nail cut as done"
      >
        <Text style={styles.checkMark}>{saving ? "…" : "✓"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: "#f5f3ff",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  text: { fontSize: 13, color: "#555", flexShrink: 1 },
  bold: { fontWeight: "800", color: "#7c3aed" },
  checkBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  checkMark: { fontSize: 17, fontWeight: "900", color: "#7c3aed" },
});
