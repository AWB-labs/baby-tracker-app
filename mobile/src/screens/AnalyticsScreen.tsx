import React, { useMemo, useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { useLogs } from "../hooks/useLogs";
import { useBaby } from "../context/BabyContext";
import BabySwitcher from "../components/BabySwitcher";
import StatCard from "../components/StatCard";
import { formatMinutes, formatDuration } from "../utils/formatDuration";
import { formatTime } from "../utils/formatTime";
import { overlapMinutes } from "../lib/dayMath";
import { useUnits } from "../context/SettingsContext";
import type { LogEntry } from "../api/logs";

const DIAPER_STATUS_META: Record<string, { icon: string; label: string }> = {
  empty: { icon: "✅", label: "Empty" },
  wet: { icon: "💧", label: "Wet" },
  dirty: { icon: "💩", label: "Dirty" },
  wet_and_dirty: { icon: "💧💩", label: "Wet & Dirty" },
};

interface DayStats {
  dateKey: string;
  dateLabel: string;
  feedTime: number;
  feedCount: number;
  pumpMl: number;
  pumpTime: number;
  pumpCount: number;
  sleepTime: number;
  sleepCount: number;
  diaperCount: number;
  showerCount: number;
  vitaminCount: number;
  nailcutCount: number;
  healthCount: number;
  totalLogs: number;
  diaperLogs: LogEntry[];
  feedLogs: LogEntry[];
  pumpLogs: LogEntry[];
}

const EMPTY_DAY = {
  feedTime: 0,
  feedCount: 0,
  pumpMl: 0,
  pumpTime: 0,
  pumpCount: 0,
  sleepTime: 0,
  sleepCount: 0,
  diaperCount: 0,
  showerCount: 0,
  vitaminCount: 0,
  nailcutCount: 0,
  healthCount: 0,
  totalLogs: 0,
};

function getDayKey(iso: string): string {
  return new Date(iso).toDateString();
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

function sideLabel(side: string | null): string {
  if (side === "left") return "L";
  if (side === "right") return "R";
  return side ?? "";
}

function computeAllDayStats(logs: LogEntry[]): DayStats[] {
  const groups = new Map<string, LogEntry[]>();
  for (const log of logs) {
    const key = getDayKey(log.startTime);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(log);
  }

  const results: DayStats[] = [];
  for (const [dateKey, dayLogs] of groups) {
    // Local midnight for this day, derived from a log that belongs to it.
    const anchor = new Date(dayLogs[0].startTime);
    const dayStart = new Date(
      anchor.getFullYear(),
      anchor.getMonth(),
      anchor.getDate()
    );
    // Time totals count only the portion of each log falling on THIS day, so an
    // overnight sleep is split across the days it spans (no >24h totals) and its
    // later-day portion is credited to the correct day. Scans all logs so a
    // sleep that started the previous day still counts here.
    const totalTime = (type: string) =>
      logs
        .filter((l) => l.type === type)
        .reduce(
          (sum, l) => sum + overlapMinutes(l.startTime, l.endTime, dayStart),
          0
        );
    const count = (type: string) => dayLogs.filter((l) => l.type === type).length;
    const totalMl = (type: string) =>
      dayLogs
        .filter((l) => l.type === type && l.amountMl)
        .reduce((sum, l) => sum + (l.amountMl ?? 0), 0);
    const byTime = (a: LogEntry, b: LogEntry) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime();

    results.push({
      dateKey,
      dateLabel: formatDateShort(dayLogs[0].startTime),
      feedTime: totalTime("feed"),
      feedCount: count("feed"),
      pumpMl: totalMl("pump"),
      pumpTime: totalTime("pump"),
      pumpCount: count("pump"),
      sleepTime: totalTime("sleep"),
      sleepCount: count("sleep"),
      diaperCount: count("diaper"),
      showerCount: count("shower"),
      vitaminCount: count("vitamin"),
      nailcutCount: count("nailcut"),
      healthCount: count("health"),
      totalLogs: dayLogs.length,
      diaperLogs: dayLogs.filter((l) => l.type === "diaper").sort(byTime),
      feedLogs: dayLogs.filter((l) => l.type === "feed").sort(byTime),
      pumpLogs: dayLogs.filter((l) => l.type === "pump").sort(byTime),
    });
  }

  return results;
}

export default function AnalyticsScreen() {
  const theme = useTheme();
  const units = useUnits();
  const { activeBaby } = useBaby();
  const { logs, loading, refresh } = useLogs("all");
  const [refreshing, setRefreshing] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const toggleDay = useCallback((key: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const { dayStats, todayStats, avgStats, totalStats, dayCount } = useMemo(() => {
    const allDays = computeAllDayStats(logs);
    const count = allDays.length || 1;
    const todayKey = new Date().toDateString();
    const today = allDays.find((d) => d.dateKey === todayKey) || EMPTY_DAY;
    const sum = (fn: (d: DayStats) => number) =>
      allDays.reduce((s, d) => s + fn(d), 0);
    return {
      dayStats: allDays,
      todayStats: today,
      dayCount: count,
      avgStats: {
        feedTime: sum((d) => d.feedTime) / count,
        pumpMl: sum((d) => d.pumpMl) / count,
        sleepTime: sum((d) => d.sleepTime) / count,
        diaperCount: sum((d) => d.diaperCount) / count,
        showerCount: sum((d) => d.showerCount) / count,
        vitaminCount: sum((d) => d.vitaminCount) / count,
        nailcutCount: sum((d) => d.nailcutCount) / count,
        healthCount: sum((d) => d.healthCount) / count,
      },
      totalStats: {
        feedTime: sum((d) => d.feedTime),
        feedCount: sum((d) => d.feedCount),
        pumpMl: sum((d) => d.pumpMl),
        pumpCount: sum((d) => d.pumpCount),
        sleepTime: sum((d) => d.sleepTime),
        sleepCount: sum((d) => d.sleepCount),
        diaperCount: sum((d) => d.diaperCount),
        showerCount: sum((d) => d.showerCount),
        vitaminCount: sum((d) => d.vitaminCount),
        nailcutCount: sum((d) => d.nailcutCount),
        healthCount: sum((d) => d.healthCount),
        totalLogs: sum((d) => d.totalLogs),
      },
    };
  }, [logs]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Analytics</Text>
            <Text style={styles.subtitle}>
              {dayCount} day{dayCount !== 1 ? "s" : ""} tracked ·{" "}
              {totalStats.totalLogs} logs
              {activeBaby ? ` · ${activeBaby.name}` : ""}
            </Text>
          </View>
          <BabySwitcher />
        </View>

        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={styles.cards}>
              <StatCard
                icon="🤱"
                label="Feeding"
                today={formatMinutes(todayStats.feedTime)}
                avg={formatMinutes(Math.round(avgStats.feedTime))}
                total={formatMinutes(totalStats.feedTime)}
                totalCount={totalStats.feedCount}
              />
              <StatCard
                icon="🍼"
                label="Pumping"
                today={units.formatVolume(todayStats.pumpMl)}
                avg={units.formatVolume(avgStats.pumpMl)}
                total={units.formatVolume(totalStats.pumpMl)}
                totalCount={totalStats.pumpCount}
              />
              <StatCard
                icon="😴"
                label="Sleep"
                today={formatMinutes(todayStats.sleepTime)}
                avg={formatMinutes(Math.round(avgStats.sleepTime))}
                total={formatMinutes(totalStats.sleepTime)}
                totalCount={totalStats.sleepCount}
              />
              <StatCard
                icon="🩲"
                label="Diapers"
                today={String(todayStats.diaperCount)}
                avg={avgStats.diaperCount.toFixed(1)}
                total={String(totalStats.diaperCount)}
              />
              <StatCard
                icon="🚿"
                label="Showers"
                today={String(todayStats.showerCount)}
                avg={avgStats.showerCount.toFixed(1)}
                total={String(totalStats.showerCount)}
              />
              <StatCard
                icon="💊"
                label="Vitamins"
                today={String(todayStats.vitaminCount)}
                avg={avgStats.vitaminCount.toFixed(1)}
                total={String(totalStats.vitaminCount)}
              />
              <StatCard
                icon="💅"
                label="Nail Cut"
                today={String(todayStats.nailcutCount)}
                avg={avgStats.nailcutCount.toFixed(1)}
                total={String(totalStats.nailcutCount)}
              />
              <StatCard
                icon="🩺"
                label="Health"
                today={String(todayStats.healthCount)}
                avg={avgStats.healthCount.toFixed(1)}
                total={String(totalStats.healthCount)}
              />
            </View>

            {/* Daily breakdown */}
            {dayStats.length > 1 && (
              <View style={styles.tableSection}>
                <Text style={[styles.tableTitle, { color: theme.primary }]}>
                  DAILY BREAKDOWN
                </Text>
                <View style={styles.dayList}>
                  {dayStats.map((day) => {
                    const expanded = expandedDays.has(day.dateKey);
                    const chips = [
                      { key: "feed", icon: "🤱", value: formatMinutes(day.feedTime), show: day.feedTime > 0 },
                      { key: "pumpMl", icon: "🍼", value: units.formatVolume(day.pumpMl), show: day.pumpMl > 0 },
                      { key: "pumpTime", icon: "⏱", value: formatMinutes(day.pumpTime), show: day.pumpTime > 0 },
                      { key: "sleep", icon: "😴", value: formatMinutes(day.sleepTime), show: day.sleepTime > 0 },
                      { key: "diaper", icon: "🩲", value: `${day.diaperCount}×`, show: day.diaperCount > 0 },
                      { key: "shower", icon: "🚿", value: `${day.showerCount}×`, show: day.showerCount > 0 },
                      { key: "vitamin", icon: "💊", value: `${day.vitaminCount}×`, show: day.vitaminCount > 0 },
                      { key: "nailcut", icon: "💅", value: `${day.nailcutCount}×`, show: day.nailcutCount > 0 },
                      { key: "health", icon: "🩺", value: `${day.healthCount}×`, show: day.healthCount > 0 },
                    ].filter((c) => c.show);
                    const hasDetail =
                      day.diaperLogs.length > 0 ||
                      day.feedLogs.length > 0 ||
                      day.pumpLogs.length > 0;

                    return (
                      <View key={day.dateKey} style={styles.dayCard}>
                        <TouchableOpacity
                          onPress={() => hasDetail && toggleDay(day.dateKey)}
                          activeOpacity={hasDetail ? 0.7 : 1}
                        >
                          <View style={styles.dayHeader}>
                            <Text style={styles.dayLabel}>{day.dateLabel}</Text>
                            {hasDetail && (
                              <Text style={styles.chevron}>{expanded ? "▲" : "▼"}</Text>
                            )}
                          </View>
                          <View style={styles.chipRow}>
                            {chips.map((c) => (
                              <View
                                key={c.key}
                                style={[styles.chip, { backgroundColor: theme.primaryLighter }]}
                              >
                                <Text style={styles.chipText}>
                                  {c.icon} {c.value}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </TouchableOpacity>

                        {expanded && (
                          <View style={styles.detail}>
                            {day.diaperLogs.length > 0 && (
                              <View style={styles.detailBlock}>
                                <Text style={styles.detailTitle}>🩲 Diapers</Text>
                                {day.diaperLogs.map((log) => {
                                  const m =
                                    log.diaperStatus && DIAPER_STATUS_META[log.diaperStatus];
                                  return (
                                    <View key={log.id} style={styles.detailRow}>
                                      <Text style={styles.detailTime}>
                                        {formatTime(log.startTime)}
                                      </Text>
                                      <Text style={styles.detailValue}>
                                        {m ? `${m.icon} ${m.label}` : "—"}
                                      </Text>
                                    </View>
                                  );
                                })}
                              </View>
                            )}

                            {day.feedLogs.length > 0 && (
                              <View style={styles.detailBlock}>
                                <Text style={styles.detailTitle}>🤱 Feeds</Text>
                                {day.feedLogs.map((log) => {
                                  const side = sideLabel(log.side);
                                  return (
                                    <View key={log.id} style={styles.detailRow}>
                                      <Text style={styles.detailTime}>
                                        {formatTime(log.startTime)}
                                      </Text>
                                      {side ? (
                                        <View
                                          style={[
                                            styles.detailPill,
                                            { backgroundColor: theme.primaryLight },
                                          ]}
                                        >
                                          <Text
                                            style={[
                                              styles.detailPillText,
                                              { color: theme.pillText },
                                            ]}
                                          >
                                            {side}
                                          </Text>
                                        </View>
                                      ) : null}
                                      {log.amountMl !== null && (
                                        <View style={[styles.detailPill, styles.mlPill]}>
                                          <Text style={styles.mlPillText}>
                                            🍼 {units.formatVolume(log.amountMl)}
                                          </Text>
                                        </View>
                                      )}
                                      {log.durationMinutes ? (
                                        <Text style={styles.detailValue}>
                                          {formatDuration(log.durationMinutes)}
                                        </Text>
                                      ) : null}
                                    </View>
                                  );
                                })}
                              </View>
                            )}

                            {day.pumpLogs.length > 0 && (
                              <View style={styles.detailBlock}>
                                <Text style={styles.detailTitle}>🍼 Pumps</Text>
                                {day.pumpLogs.map((log) => {
                                  const side = sideLabel(log.side);
                                  return (
                                    <View key={log.id} style={styles.detailRow}>
                                      <Text style={styles.detailTime}>
                                        {formatTime(log.startTime)}
                                      </Text>
                                      {side ? (
                                        <View
                                          style={[
                                            styles.detailPill,
                                            { backgroundColor: theme.primaryLight },
                                          ]}
                                        >
                                          <Text
                                            style={[
                                              styles.detailPillText,
                                              { color: theme.pillText },
                                            ]}
                                          >
                                            {side}
                                          </Text>
                                        </View>
                                      ) : null}
                                      {log.amountMl !== null && (
                                        <View style={[styles.detailPill, styles.mlPill]}>
                                          <Text style={styles.mlPillText}>
                                            {units.formatVolume(log.amountMl)}
                                          </Text>
                                        </View>
                                      )}
                                      {log.durationMinutes ? (
                                        <Text style={styles.detailValue}>
                                          {formatDuration(log.durationMinutes)}
                                        </Text>
                                      ) : null}
                                    </View>
                                  );
                                })}
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  title: { fontSize: 24, fontWeight: "800", color: "#1a1a1a" },
  subtitle: { fontSize: 13, color: "#aaa", marginTop: 2 },
  cards: { gap: 12, marginBottom: 24 },
  tableSection: { marginTop: 8 },
  tableTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textAlign: "center",
    textTransform: "uppercase",
    marginBottom: 12,
  },
  dayList: { gap: 10 },
  dayCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  dayLabel: { fontSize: 14, fontWeight: "700", color: "#333" },
  chevron: { fontSize: 11, color: "#bbb" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontSize: 11, fontWeight: "700", color: "#555" },
  detail: { marginTop: 12, gap: 12 },
  detailBlock: { gap: 4 },
  detailTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: "#aaa",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  detailTime: { fontSize: 12, color: "#888", fontVariant: ["tabular-nums"] },
  detailValue: { fontSize: 12, color: "#666" },
  detailPill: { borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  detailPillText: { fontSize: 10, fontWeight: "700" },
  mlPill: { backgroundColor: "#eff6ff" },
  mlPillText: { fontSize: 10, fontWeight: "700", color: "#3b82f6" },
});
