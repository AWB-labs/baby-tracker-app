import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { formatMinutes } from "../utils/formatDuration";
import { useUnits } from "../context/SettingsContext";

export interface DayStats {
  feedTime: number;
  /** Pumped volume for the day, in ml. */
  pumpMl: number;
  pumpTime: number;
  sleepTime: number;
  diaperCount: number;
  showerCount: number;
  vitaminCount: number;
  nailcutCount: number;
  healthCount: number;
}

interface Props {
  stats: DayStats;
}

export default function DayStatsBar({ stats }: Props) {
  const units = useUnits();
  const items = [
    { key: "feed", icon: "🤱", value: formatMinutes(stats.feedTime), show: stats.feedTime > 0 },
    { key: "pumpMl", icon: "🍼", value: units.formatVolume(stats.pumpMl), show: stats.pumpMl > 0 },
    { key: "pumpTime", icon: "⏱", value: formatMinutes(stats.pumpTime), show: stats.pumpTime > 0 },
    { key: "sleep", icon: "😴", value: formatMinutes(stats.sleepTime), show: stats.sleepTime > 0 },
    { key: "diaper", icon: "🩲", value: `${stats.diaperCount}×`, show: stats.diaperCount > 0 },
    { key: "shower", icon: "🚿", value: `${stats.showerCount}×`, show: stats.showerCount > 0 },
    { key: "vitamin", icon: "💊", value: `${stats.vitaminCount}×`, show: stats.vitaminCount > 0 },
    { key: "nailcut", icon: "💅", value: `${stats.nailcutCount}×`, show: stats.nailcutCount > 0 },
    { key: "health", icon: "🩺", value: `${stats.healthCount}×`, show: stats.healthCount > 0 },
  ].filter((i) => i.show);

  if (items.length === 0) return null;

  return (
    <View style={styles.row}>
      {items.map((item) => (
        <View key={item.key} style={styles.chip}>
          <Text style={styles.chipIcon}>{item.icon}</Text>
          <Text style={styles.chipValue}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  chipIcon: { fontSize: 13 },
  chipValue: { fontSize: 11, fontWeight: "700", color: "#555" },
});
