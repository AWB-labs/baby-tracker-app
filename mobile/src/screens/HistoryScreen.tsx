import React, { useState, useMemo, useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../design/ThemeProvider";
import { space, radius, hitSlop, HIT_SLOP_MIN, PRESSED_OPACITY } from "../design/tokens";
import { Icon } from "../design/icons";
import { useActivityTone, DIAPER_META } from "../design/activity";
import {
  Screen,
  ScreenHeader,
  Card,
  Text,
  Emoji,
  EmptyState,
  SkeletonList,
  FadeInUp,
} from "../components/ui";
import { useLogs } from "../hooks/useLogs";
import { useBaby } from "../context/BabyContext";
import BabySwitcher from "../components/BabySwitcher";
import DayStatsBar, { DayStats } from "../components/DayStatsBar";
import { LogRow } from "../components/LogsList";
import { formatTime, formatDateLabelLong } from "../utils/formatTime";
import { overlapMinutes } from "../lib/dayMath";
import type { LogEntry } from "../api/logs";

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
  const t = useTheme();
  const feedTone = useActivityTone("feed");
  const diaperTone = useActivityTone("diaper");
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
      ? DIAPER_META[lastDiaper.diaperStatus] ?? null
      : null;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <ScreenHeader
        title="History"
        subtitle={`${days.length} day${days.length !== 1 ? "s" : ""} of activity${
          activeBaby ? ` · ${activeBaby.name}` : ""
        }`}
        actions={<BabySwitcher />}
      />

      {(lastFeed || lastDiaper) && (
        <View style={styles.summaryRow}>
          <Card
            style={styles.summaryCard}
            accessible
            accessibilityLabel={
              lastFeed
                ? `Last feed ${formatRelativeTime(lastFeed.startTime)}${
                    lastFeed.side ? `, ${lastFeed.side} side` : ""
                  }, at ${formatTime(lastFeed.startTime)}`
                : "Last feed: none yet"
            }
          >
            <View style={styles.summaryLabel}>
              <Emoji size={13}>{feedTone.emoji}</Emoji>
              <Text variant="caption" tone="muted">
                Last feed
              </Text>
            </View>
            {lastFeed ? (
              <>
                <Text
                  variant="subheadStrong"
                  style={{ color: feedTone.text }}
                  tabular
                >
                  {formatRelativeTime(lastFeed.startTime)}
                  {lastFeed.side ? (
                    <Text variant="caption" style={{ color: feedTone.text }}>
                      {" "}
                      ({lastFeed.side === "left" ? "L" : "R"})
                    </Text>
                  ) : null}
                </Text>
                <Text variant="caption" tone="subtle" tabular>
                  {formatTime(lastFeed.startTime)}
                </Text>
              </>
            ) : (
              <Text variant="subhead" tone="subtle">
                None yet
              </Text>
            )}
          </Card>

          <Card
            style={styles.summaryCard}
            accessible
            accessibilityLabel={
              lastDiaper
                ? `Last diaper ${formatRelativeTime(lastDiaper.startTime)}, at ${formatTime(
                    lastDiaper.startTime
                  )}${lastDiaperMeta ? `, ${lastDiaperMeta.label}` : ""}`
                : "Last diaper: none yet"
            }
          >
            <View style={styles.summaryLabel}>
              <Emoji size={13}>{diaperTone.emoji}</Emoji>
              <Text variant="caption" tone="muted">
                Last diaper
              </Text>
            </View>
            {lastDiaper ? (
              <>
                <Text
                  variant="subheadStrong"
                  style={{ color: diaperTone.text }}
                  tabular
                >
                  {formatRelativeTime(lastDiaper.startTime)}
                </Text>
                <View style={styles.summaryMeta}>
                  <Text variant="caption" tone="subtle" tabular>
                    {formatTime(lastDiaper.startTime)}
                  </Text>
                  {lastDiaperMeta ? (
                    <>
                      <Emoji size={11}>{lastDiaperMeta.emoji}</Emoji>
                      <Text variant="caption" tone="subtle">
                        {lastDiaperMeta.label}
                      </Text>
                    </>
                  ) : null}
                </View>
              </>
            ) : (
              <Text variant="subhead" tone="subtle">
                None yet
              </Text>
            )}
          </Card>
        </View>
      )}

      {loading ? (
        <SkeletonList rows={4} />
      ) : days.length === 0 ? (
        <EmptyState
          icon="history"
          title="No history yet"
          body="Once a feed, nap or diaper is logged it lands here, grouped by day."
        />
      ) : (
        <View style={styles.dayList}>
          {days.map((day, index) => {
            const expanded = expandedDays.has(day.dateKey);
            const countLabel = `${day.logs.length} log${
              day.logs.length !== 1 ? "s" : ""
            }`;
            return (
              <FadeInUp key={day.dateKey} index={index}>
                {/* A sunken panel so the white log rows inside read as nested
                    within the day rather than as siblings of it. A recess must
                    not cast an outward shadow, and the light-mode sunken fill
                    is only a few percent darker than the page, so the well is
                    drawn with a border instead of elevation. */}
                <Card
                  tone="sunken"
                  level={0}
                  style={[
                    styles.dayCard,
                    {
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: t.border,
                    },
                  ]}
                >
                  <Pressable
                    onPress={() => toggleDay(day.dateKey)}
                    hitSlop={hitSlop}
                    accessibilityRole="button"
                    accessibilityLabel={`${day.dateLabel}, ${countLabel}`}
                    accessibilityHint={
                      expanded ? "Collapses this day" : "Shows this day's entries"
                    }
                    accessibilityState={{ expanded }}
                    style={({ pressed }) => [
                      styles.dayHeader,
                      { opacity: pressed ? PRESSED_OPACITY : 1 },
                    ]}
                  >
                    <Text
                      variant="subheadStrong"
                      numberOfLines={1}
                      style={styles.dayLabel}
                    >
                      {day.dateLabel}
                    </Text>
                    <View style={styles.dayRight}>
                      <Text variant="caption" tone="subtle">
                        {countLabel}
                      </Text>
                      <Icon
                        name={expanded ? "chevronUp" : "chevronDown"}
                        size="sm"
                        color={t.textSubtle}
                      />
                    </View>
                  </Pressable>

                  <DayStatsBar stats={day.stats} />

                  {expanded && (
                    <View style={styles.logItems}>
                      {day.logs.map((log) => (
                        <LogRow key={log.id} log={log} />
                      ))}
                    </View>
                  )}
                </Card>
              </FadeInUp>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: "row", gap: space.md },
  summaryCard: { flex: 1, gap: space.xxs, padding: space.md },
  summaryLabel: { flexDirection: "row", alignItems: "center", gap: space.xs },
  summaryMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.xs,
  },
  dayList: { gap: space.md },
  dayCard: { gap: space.sm, borderRadius: radius.lg },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    minHeight: HIT_SLOP_MIN,
  },
  dayLabel: { flex: 1 },
  dayRight: { flexDirection: "row", alignItems: "center", gap: space.sm },
  logItems: { gap: space.sm },
});
