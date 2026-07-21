import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../theme";

interface Props {
  icon: string;
  label: string;
  today: string;
  avg: string;
  total: string;
  /** How many times the activity happened all-time, shown under the total. */
  totalCount?: number;
}

export default function StatCard({
  icon,
  label,
  today,
  avg,
  total,
  totalCount,
}: Props) {
  const theme = useTheme();
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.icon}>{icon}</Text>
        <Text style={styles.label}>{label}</Text>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.statCell}>
          <Text style={[styles.statValue, { color: theme.primary }]}>{today}</Text>
          <Text style={styles.statLabel}>TODAY</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statValueGray}>{avg}</Text>
          <Text style={styles.statLabel}>DAILY AVG</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={[styles.statValueGray, { color: "#aaa" }]}>{total}</Text>
          <Text style={styles.statLabel}>ALL TIME</Text>
          {totalCount !== undefined && totalCount > 0 && (
            <Text style={[styles.statCount, { color: theme.primary }]}>
              {totalCount} time{totalCount !== 1 ? "s" : ""}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  icon: { fontSize: 20 },
  label: { fontSize: 13, fontWeight: "700", color: "#555" },
  statsRow: { flexDirection: "row" },
  statCell: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 20, fontWeight: "700" },
  statValueGray: { fontSize: 20, fontWeight: "700", color: "#555" },
  statLabel: { fontSize: 9, fontWeight: "700", color: "#bbb", letterSpacing: 0.5, marginTop: 2 },
  statCount: { fontSize: 9, fontWeight: "700", marginTop: 2 },
});
