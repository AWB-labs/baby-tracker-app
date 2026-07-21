import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { useUnits } from "../context/SettingsContext";
import { useLogs } from "../hooks/useLogs";
import { useBaby } from "../context/BabyContext";
import BabySwitcher from "../components/BabySwitcher";
import DayStatsBar, { DayStats } from "../components/DayStatsBar";
import PauseTimelineIndicator from "../components/PauseTimelineIndicator";
import { formatTime, formatDateLabelLong } from "../utils/formatTime";
import { formatDuration } from "../utils/formatDuration";
import { overlapMinutes, dayOffset, shortDate } from "../lib/dayMath";
import { isInstantLog } from "../lib/activities";
import { HEALTH_CONDITION_META, type HealthCondition } from "../lib/health";
import type { LogEntry } from "../api/logs";

const TYPE_META: Record<string, { icon: string; label: string }> = {
  pump: { icon: "🍼", label: "Pump" },
  feed: { icon: "🤱", label: "Feed" },
  sleep: { icon: "😴", label: "Sleep" },
  diaper: { icon: "🩲", label: "Diaper" },
  shower: { icon: "🚿", label: "Shower" },
  vitamin: { icon: "💊", label: "Vitamin" },
  nailcut: { icon: "💅", label: "Nail Cut" },
  growth: { icon: "📏", label: "Growth" },
  health: { icon: "🩺", label: "Health" },
};

const DIAPER_STATUS_META: Record<string, { icon: string; label: string }> = {
  empty: { icon: "✅", label: "Empty" },
  wet: { icon: "💧", label: "Wet" },
  dirty: { icon: "💩", label: "Dirty" },
  wet_and_dirty: { icon: "💧💩", label: "Wet & Dirty" },
};

interface DayGroup {
  dateKey: string;
  dateLabel: string;
  logs: LogEntry[];
  stats: DayStats;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function groupByDay(logs: LogEntry[]): DayGroup[] {
  const groups = new Map<string, LogEntry[]>();
  for (const log of logs) {
    const key = new Date(log.startTime).toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(log);
  }

  const result: DayGroup[] = [];
  for (const [dateKey, dayLogs] of groups) {
    // Local midnight for this day, derived from a log that belongs to it.
    const anchor = new Date(dayLogs[0].startTime);
    const dayStart = new Date(
      anchor.getFullYear(),
      anchor.getMonth(),
      anchor.getDate()
    );
    // Time totals count only the portion of each log that falls on THIS day, so
    // an overnight sleep is split across the days it spans (no >24h totals) and
    // its later-day portion is credited to the correct day. Scans all logs, not
    // just this group's, so a sleep that started the previous day still counts.
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

    result.push({
      dateKey,
      dateLabel: formatDateLabelLong(dayLogs[0].startTime),
      logs: dayLogs,
      stats: {
        feedTime: totalTime("feed"),
        pumpMl: totalMl("pump"),
        pumpTime: totalTime("pump"),
        sleepTime: totalTime("sleep"),
        diaperCount: count("diaper"),
        showerCount: count("shower"),
        vitaminCount: count("vitamin"),
        nailcutCount: count("nailcut"),
        healthCount: count("health"),
      },
    });
  }

  return result;
}

function latestOfType(logs: LogEntry[], type: string): LogEntry | null {
  let latest: LogEntry | null = null;
  for (const log of logs) {
    if (log.type !== type) continue;
    if (
      !latest ||
      new Date(log.startTime).getTime() > new Date(latest.startTime).getTime()
    ) {
      latest = log;
    }
  }
  return latest;
}

export default function HistoryScreen() {
  const theme = useTheme();
  const units = useUnits();
  const { activeBaby } = useBaby();
  const { logs, loading, refresh } = useLogs("all");
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const days = useMemo(() => groupByDay(logs), [logs]);
  const lastFeed = useMemo(() => latestOfType(logs, "feed"), [logs]);
  const lastDiaper = useMemo(() => latestOfType(logs, "diaper"), [logs]);

  const toggleDay = (key: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const lastDiaperMeta =
    lastDiaper?.diaperStatus != null
      ? DIAPER_STATUS_META[lastDiaper.diaperStatus] ?? null
      : null;

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
            <Text style={styles.title}>History</Text>
            <Text style={styles.subtitle}>
              {days.length} day{days.length !== 1 ? "s" : ""} of activity
              {activeBaby ? ` · ${activeBaby.name}` : ""}
            </Text>
          </View>
          <BabySwitcher />
        </View>

        {/* Last feed / last diaper summary */}
        {(lastFeed || lastDiaper) && (
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>🤱 Last feed</Text>
              {lastFeed ? (
                <>
                  <Text style={[styles.summaryValue, { color: theme.primary }]}>
                    {formatRelativeTime(lastFeed.startTime)}
                    {lastFeed.side ? (
                      <Text style={styles.summarySide}>
                        {" "}({lastFeed.side === "left" ? "L" : "R"})
                      </Text>
                    ) : null}
                  </Text>
                  <Text style={styles.summaryMeta}>
                    {formatTime(lastFeed.startTime)}
                  </Text>
                </>
              ) : (
                <Text style={styles.summaryNone}>None yet</Text>
              )}
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>🩲 Last diaper</Text>
              {lastDiaper ? (
                <>
                  <Text style={[styles.summaryValue, { color: theme.primary }]}>
                    {formatRelativeTime(lastDiaper.startTime)}
                  </Text>
                  <Text style={styles.summaryMeta}>
                    {formatTime(lastDiaper.startTime)}
                    {lastDiaperMeta
                      ? ` · ${lastDiaperMeta.icon} ${lastDiaperMeta.label}`
                      : ""}
                  </Text>
                </>
              ) : (
                <Text style={styles.summaryNone}>None yet</Text>
              )}
            </View>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
        ) : days.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>No history yet.</Text>
          </View>
        ) : (
          <View style={styles.dayList}>
            {days.map((day) => {
              const expanded = expandedDays.has(day.dateKey);
              return (
                <View key={day.dateKey} style={[styles.dayCard, { backgroundColor: theme.primaryLighter }]}>
                  <TouchableOpacity
                    onPress={() => toggleDay(day.dateKey)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.dayHeader}>
                      <Text style={styles.dayLabel}>{day.dateLabel}</Text>
                      <View style={styles.dayRight}>
                        <Text style={styles.logCount}>
                          {day.logs.length} log{day.logs.length !== 1 ? "s" : ""}
                        </Text>
                        <Text style={styles.chevron}>{expanded ? "▲" : "▼"}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.statsBar}>
                    <DayStatsBar stats={day.stats} />
                  </View>
                  {expanded && (
                    <View style={styles.logItems}>
                      {day.logs.map((log) => {
                        const meta = TYPE_META[log.type] || { icon: "❓", label: log.type };
                        const diaperMeta =
                          log.type === "diaper" && log.diaperStatus
                            ? DIAPER_STATUS_META[log.diaperStatus]
                            : null;
                        const instant = isInstantLog(log.type, {
                          side: log.side,
                          amountMl: log.amountMl,
                        });
                        const crossesDays =
                          !instant && log.endTime
                            ? dayOffset(log.startTime, log.endTime)
                            : 0;
                        const healthMeta =
                          log.type === "health" && log.healthCondition
                            ? HEALTH_CONDITION_META[
                                log.healthCondition as HealthCondition
                              ]
                            : null;
                        return (
                          <View
                            key={log.id}
                            style={[styles.logCard, { backgroundColor: "#fff" }]}
                          >
                            <View style={[styles.logIconCircle, { backgroundColor: theme.primaryLighter }]}>
                              <Text style={styles.logIcon}>{meta.icon}</Text>
                            </View>
                            <View style={styles.logInfo}>
                              <View style={styles.logTopRow}>
                                <Text style={styles.logName}>
                                  {meta.label}
                                  {log.side ? (
                                    <Text style={[styles.logSide, { color: theme.primary }]}>
                                      {" "}({log.side === "left" ? "L" : "R"})
                                    </Text>
                                  ) : null}
                                </Text>
                                {!instant &&
                                  log.durationMinutes !== null &&
                                  log.durationMinutes > 0 && (
                                    <View style={[styles.durBadge, { backgroundColor: theme.primaryLight }]}>
                                      <Text style={[styles.durText, { color: theme.pillText }]}>
                                        {formatDuration(log.durationMinutes)}
                                      </Text>
                                    </View>
                                  )}
                              </View>
                              <View style={styles.logTimeRow}>
                                <Text style={styles.logTime}>{formatTime(log.startTime)}</Text>
                                {!instant && log.endTime && (
                                  <>
                                    <Text style={styles.logArrow}>→</Text>
                                    <Text style={styles.logTime}>{formatTime(log.endTime)}</Text>
                                    {crossesDays > 0 && (
                                      <View style={styles.overnightBadge}>
                                        <Text style={styles.overnightText}>
                                          {crossesDays === 1
                                            ? `next day · ${shortDate(log.endTime)}`
                                            : `+${crossesDays}d · ${shortDate(log.endTime)}`}
                                        </Text>
                                      </View>
                                    )}
                                  </>
                                )}
                              </View>
                              <PauseTimelineIndicator pauseTimelineJson={log.pauseTimelineJson} />
                              {(log.type === "feed" || log.type === "pump") &&
                                log.amountMl !== null && (
                                  <View style={styles.mlBadge}>
                                    <Text style={styles.mlText}>
                                      🍼 {units.formatVolume(log.amountMl)}
                                    </Text>
                                  </View>
                                )}
                              {diaperMeta && (
                                <View style={styles.diaperBadge}>
                                  <Text style={styles.diaperBadgeText}>
                                    {diaperMeta.icon} {diaperMeta.label}
                                  </Text>
                                </View>
                              )}
                              {log.type === "growth" && (log.weightKg || log.heightCm) && (
                                <View style={styles.badgeRow}>
                                  {log.weightKg !== null && (
                                    <View style={styles.weightBadge}>
                                      <Text style={styles.weightText}>
                                        ⚖️ {units.formatWeight(log.weightKg)}
                                      </Text>
                                    </View>
                                  )}
                                  {log.heightCm !== null && (
                                    <View style={styles.heightBadge}>
                                      <Text style={styles.heightText}>
                                        📏 {units.formatHeight(log.heightCm)}
                                      </Text>
                                    </View>
                                  )}
                                </View>
                              )}
                              {log.type === "health" &&
                                (healthMeta || log.feverCelsius !== null) && (
                                  <View style={styles.badgeRow}>
                                    {healthMeta && (
                                      <View style={styles.conditionBadge}>
                                        <Text style={styles.conditionText}>
                                          {healthMeta.icon} {healthMeta.label}
                                        </Text>
                                      </View>
                                    )}
                                    {log.feverCelsius !== null && (
                                      <View style={styles.feverBadge}>
                                        <Text style={styles.feverText}>
                                          🌡️{" "}
                                          {units.formatTemperature(
                                            log.feverCelsius
                                          )}
                                        </Text>
                                      </View>
                                    )}
                                  </View>
                                )}
                              {log.comments ? (
                                <Text style={styles.logComment}>&ldquo;{log.comments}&rdquo;</Text>
                              ) : null}
                              <Text style={styles.logBy}>by {log.enteredByName}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
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
  summaryRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  summaryCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  summaryLabel: { fontSize: 12, fontWeight: "700", color: "#888" },
  summaryValue: { fontSize: 14, fontWeight: "700", marginTop: 4 },
  summarySide: { fontSize: 12, fontWeight: "700" },
  summaryMeta: { fontSize: 11, color: "#aaa", marginTop: 2 },
  summaryNone: { fontSize: 14, color: "#ddd", marginTop: 4 },
  empty: { alignItems: "center", paddingTop: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  emptyText: { fontSize: 14, color: "#ccc" },
  dayList: { gap: 14 },
  dayCard: { borderRadius: 18, padding: 14 },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dayLabel: { fontSize: 14, fontWeight: "700", color: "#1a1a1a" },
  dayRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  logCount: { fontSize: 11, color: "#aaa" },
  chevron: { fontSize: 11, color: "#aaa" },
  statsBar: { marginTop: 8 },
  logItems: { marginTop: 10, gap: 6 },
  logCard: {
    borderRadius: 14,
    padding: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  logIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  logIcon: { fontSize: 17 },
  logInfo: { flex: 1 },
  logTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logName: { fontSize: 13, fontWeight: "700", color: "#1a1a1a" },
  logSide: { fontSize: 12, fontWeight: "400" },
  durBadge: { borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  durText: { fontSize: 10, fontWeight: "700" },
  logTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 1,
  },
  logTime: { fontSize: 11, color: "#aaa" },
  logArrow: { fontSize: 11, color: "#ccc" },
  overnightBadge: {
    backgroundColor: "#eef2ff",
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  overnightText: { fontSize: 10, color: "#4f46e5", fontWeight: "700" },
  mlBadge: {
    marginTop: 3,
    backgroundColor: "#eff6ff",
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  mlText: { fontSize: 10, color: "#3b82f6", fontWeight: "600" },
  diaperBadge: {
    marginTop: 3,
    backgroundColor: "#fffbeb",
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  diaperBadgeText: { fontSize: 10, color: "#b45309", fontWeight: "600" },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 3 },
  weightBadge: {
    backgroundColor: "#eff6ff",
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  weightText: { fontSize: 10, color: "#3b82f6", fontWeight: "600" },
  heightBadge: {
    backgroundColor: "#f0fdf4",
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  heightText: { fontSize: 10, color: "#16a34a", fontWeight: "600" },
  conditionBadge: {
    backgroundColor: "#fff1f2",
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  conditionText: { fontSize: 10, color: "#be123c", fontWeight: "600" },
  feverBadge: {
    backgroundColor: "#fff7ed",
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  feverText: { fontSize: 10, color: "#c2410c", fontWeight: "600" },
  logComment: { fontSize: 11, color: "#888", fontStyle: "italic", marginTop: 3 },
  logBy: { fontSize: 10, color: "#ccc", marginTop: 2 },
});
