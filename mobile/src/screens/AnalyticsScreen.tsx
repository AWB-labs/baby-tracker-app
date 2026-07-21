import React, { useMemo, useCallback, useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type DimensionValue,
} from "react-native";
import { useTheme } from "../design/ThemeProvider";
import { space, radius, PRESSED_OPACITY } from "../design/tokens";
import { Icon, type IconName } from "../design/icons";
import {
  useActivityTones,
  ACTIVITY_LABEL,
  DIAPER_META,
  MEASURE_EMOJI,
  type ActivityKey,
  type ActivityTone,
} from "../design/activity";
import {
  Screen,
  ScreenHeader,
  SectionHeader,
  Card,
  Divider,
  Text,
  Emoji,
  SkeletonList,
  FadeInUp,
} from "../components/ui";
import { useLogs } from "../hooks/useLogs";
import { useBaby } from "../context/BabyContext";
import BabySwitcher from "../components/BabySwitcher";
import StatCard from "../components/StatCard";
import { formatMinutes, formatDuration } from "../utils/formatDuration";
import { formatTime } from "../utils/formatTime";
import { overlapMinutes } from "../lib/dayMath";
import { useUnits } from "../context/SettingsContext";
import type { LogEntry } from "../api/logs";

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

/** Activity counts that make up a day's mix bar, in a stable visual order. */
const MIX_COUNTS: { type: ActivityKey; of: (d: DayStats) => number }[] = [
  { type: "feed", of: (d) => d.feedCount },
  { type: "pump", of: (d) => d.pumpCount },
  { type: "sleep", of: (d) => d.sleepCount },
  { type: "diaper", of: (d) => d.diaperCount },
  { type: "shower", of: (d) => d.showerCount },
  { type: "vitamin", of: (d) => d.vitaminCount },
  { type: "nailcut", of: (d) => d.nailcutCount },
  { type: "health", of: (d) => d.healthCount },
];

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
  const tones = useActivityTones();
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
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <ScreenHeader
        title="Trends"
        subtitle={`${dayCount} day${dayCount !== 1 ? "s" : ""} tracked · ${
          totalStats.totalLogs
        } logs${activeBaby ? ` · ${activeBaby.name}` : ""}`}
        actions={<BabySwitcher />}
      />

      {loading ? (
        <SkeletonList rows={4} />
      ) : (
        <>
          <View style={styles.section}>
            <SectionHeader title="Per activity" />
            <View style={styles.cards}>
              <StatCard
                icon={tones.feed.emoji}
                type="feed"
                label="Feeding"
                today={formatMinutes(todayStats.feedTime)}
                avg={formatMinutes(Math.round(avgStats.feedTime))}
                total={formatMinutes(totalStats.feedTime)}
                totalCount={totalStats.feedCount}
              />
              <StatCard
                icon={tones.pump.emoji}
                type="pump"
                label="Pumping"
                today={units.formatVolume(todayStats.pumpMl)}
                avg={units.formatVolume(avgStats.pumpMl)}
                total={units.formatVolume(totalStats.pumpMl)}
                totalCount={totalStats.pumpCount}
              />
              <StatCard
                icon={tones.sleep.emoji}
                type="sleep"
                label="Sleep"
                today={formatMinutes(todayStats.sleepTime)}
                avg={formatMinutes(Math.round(avgStats.sleepTime))}
                total={formatMinutes(totalStats.sleepTime)}
                totalCount={totalStats.sleepCount}
              />
              <StatCard
                icon={tones.diaper.emoji}
                type="diaper"
                label="Diapers"
                today={String(todayStats.diaperCount)}
                avg={avgStats.diaperCount.toFixed(1)}
                total={String(totalStats.diaperCount)}
              />
              <StatCard
                icon={tones.shower.emoji}
                type="shower"
                label="Showers"
                today={String(todayStats.showerCount)}
                avg={avgStats.showerCount.toFixed(1)}
                total={String(totalStats.showerCount)}
              />
              <StatCard
                icon={tones.vitamin.emoji}
                type="vitamin"
                label="Vitamins"
                today={String(todayStats.vitaminCount)}
                avg={avgStats.vitaminCount.toFixed(1)}
                total={String(totalStats.vitaminCount)}
              />
              <StatCard
                icon={tones.nailcut.emoji}
                type="nailcut"
                label="Nail Cut"
                today={String(todayStats.nailcutCount)}
                avg={avgStats.nailcutCount.toFixed(1)}
                total={String(totalStats.nailcutCount)}
              />
              <StatCard
                icon={tones.health.emoji}
                type="health"
                label="Health"
                today={String(todayStats.healthCount)}
                avg={avgStats.healthCount.toFixed(1)}
                total={String(totalStats.healthCount)}
              />
            </View>
          </View>

          {dayStats.length > 1 && (
            <View style={styles.section}>
              <SectionHeader
                title="Daily breakdown"
                action={
                  <Text variant="caption" tone="subtle">
                    Tap a day for detail
                  </Text>
                }
              />
              <View style={styles.dayList}>
                {dayStats.map((day, index) => (
                  <FadeInUp key={day.dateKey} index={index}>
                    <DayCard
                      day={day}
                      expanded={expandedDays.has(day.dateKey)}
                      onToggle={() => toggleDay(day.dateKey)}
                    />
                  </FadeInUp>
                ))}
              </View>
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* One day                                                                     */
/* -------------------------------------------------------------------------- */

interface DayChip {
  key: string;
  type: ActivityKey;
  value: string;
  show: boolean;
  /** Replaces the activity emoji when two chips share one activity. */
  icon?: IconName;
}

function DayCard({
  day,
  expanded,
  onToggle,
}: {
  day: DayStats;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useTheme();
  const tones = useActivityTones();
  const units = useUnits();

  const chips = ([
    { key: "feed", type: "feed", value: formatMinutes(day.feedTime), show: day.feedTime > 0 },
    { key: "pumpMl", type: "pump", value: units.formatVolume(day.pumpMl), show: day.pumpMl > 0 },
    { key: "pumpTime", type: "pump", icon: "clock", value: formatMinutes(day.pumpTime), show: day.pumpTime > 0 },
    { key: "sleep", type: "sleep", value: formatMinutes(day.sleepTime), show: day.sleepTime > 0 },
    { key: "diaper", type: "diaper", value: `${day.diaperCount}×`, show: day.diaperCount > 0 },
    { key: "shower", type: "shower", value: `${day.showerCount}×`, show: day.showerCount > 0 },
    { key: "vitamin", type: "vitamin", value: `${day.vitaminCount}×`, show: day.vitaminCount > 0 },
    { key: "nailcut", type: "nailcut", value: `${day.nailcutCount}×`, show: day.nailcutCount > 0 },
    { key: "health", type: "health", value: `${day.healthCount}×`, show: day.healthCount > 0 },
  ] satisfies DayChip[]).filter((c) => c.show);

  const hasDetail =
    day.diaperLogs.length > 0 ||
    day.feedLogs.length > 0 ||
    day.pumpLogs.length > 0;

  // Pressable is one accessibility element, so an explicit label REPLACES the
  // chips' text rather than adding to it. The label therefore has to restate
  // the day's figures — and it names each activity, which the silenced emoji
  // and the colour-only chip tints otherwise leave unsaid.
  const a11yLabel = [
    day.dateLabel,
    ...chips.map((c) => `${ACTIVITY_LABEL[c.type]} ${c.value}`),
  ].join(", ");

  return (
    <Card padded={false}>
      <Pressable
        onPress={onToggle}
        disabled={!hasDetail}
        accessibilityRole={hasDetail ? "button" : undefined}
        accessibilityLabel={a11yLabel}
        accessibilityHint={
          hasDetail ? "Shows every feed, pump and diaper for this day" : undefined
        }
        accessibilityState={hasDetail ? { expanded } : undefined}
        style={({ pressed }) => [
          styles.dayHead,
          { opacity: pressed && hasDetail ? PRESSED_OPACITY : 1 },
        ]}
      >
        <View style={styles.dayTitleRow}>
          <Text variant="subheadStrong">{day.dateLabel}</Text>
          {hasDetail && (
            <Icon
              name={expanded ? "chevronUp" : "chevronDown"}
              size="sm"
              color={t.textSubtle}
            />
          )}
        </View>

        <MixBar day={day} />

        <View style={styles.chipRow}>
          {chips.map((c) => (
            <ToneChip
              key={c.key}
              tone={tones[c.type]}
              icon={c.icon}
              value={c.value}
            />
          ))}
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.detail}>
          <Divider />

          {day.diaperLogs.length > 0 && (
            <View style={styles.detailBlock}>
              <DetailHeading emoji={tones.diaper.emoji} title="Diapers" />
              {day.diaperLogs.map((log) => {
                const meta = log.diaperStatus && DIAPER_META[log.diaperStatus];
                return (
                  <View key={log.id} style={styles.detailRow}>
                    <Text variant="footnote" tone="subtle" tabular>
                      {formatTime(log.startTime)}
                    </Text>
                    {meta ? (
                      <Pill
                        emoji={meta.emoji}
                        bg={tones.diaper.soft}
                        fg={tones.diaper.text}
                      >
                        {meta.label}
                      </Pill>
                    ) : (
                      <Text variant="footnote" tone="muted">
                        —
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {day.feedLogs.length > 0 && (
            <View style={styles.detailBlock}>
              <DetailHeading emoji={tones.feed.emoji} title="Feeds" />
              {day.feedLogs.map((log) => (
                <TimedRow key={log.id} log={log} tone={tones.feed} />
              ))}
            </View>
          )}

          {day.pumpLogs.length > 0 && (
            <View style={styles.detailBlock}>
              <DetailHeading emoji={tones.pump.emoji} title="Pumps" />
              {day.pumpLogs.map((log) => (
                <TimedRow key={log.id} log={log} tone={tones.pump} />
              ))}
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

/**
 * The day's mix of activities as one continuous bar.
 *
 * It carries no figure the chips above don't already state — it exists so a long
 * list of days can be skimmed for shape rather than read — so it is decoration
 * as far as a screen reader is concerned.
 */
function MixBar({ day }: { day: DayStats }) {
  const t = useTheme();
  const tones = useActivityTones();

  const parts = MIX_COUNTS.map((m) => ({ type: m.type, count: m.of(day) })).filter(
    (p) => p.count > 0
  );
  const total = parts.reduce((sum, p) => sum + p.count, 0);
  if (total === 0) return null;

  return (
    <View
      style={[styles.bar, { backgroundColor: t.surfaceSunken }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {parts.map((p) => (
        <View
          key={p.type}
          style={{
            width: `${(p.count / total) * 100}%` as DimensionValue,
            backgroundColor: tones[p.type].main,
          }}
        />
      ))}
    </View>
  );
}

/** A day summary chip, tinted with its activity's pastel pair. */
function ToneChip({
  tone,
  icon,
  value,
}: {
  tone: ActivityTone;
  icon?: IconName;
  value: string;
}) {
  return (
    <View style={[styles.chip, { backgroundColor: tone.soft }]}>
      {icon ? (
        <Icon name={icon} size="xs" color={tone.text} />
      ) : (
        <Emoji size={12}>{tone.emoji}</Emoji>
      )}
      <Text variant="caption" tabular style={{ color: tone.text }}>
        {value}
      </Text>
    </View>
  );
}

function DetailHeading({ emoji, title }: { emoji: string; title: string }) {
  return (
    <View style={styles.detailHeading}>
      <Emoji size={12}>{emoji}</Emoji>
      <Text variant="overline" tone="subtle" accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

/** Shared by feeds and pumps — same shape, different tone. */
function TimedRow({ log, tone }: { log: LogEntry; tone: ActivityTone }) {
  const t = useTheme();
  const units = useUnits();
  const side = sideLabel(log.side);

  return (
    <View style={styles.detailRow}>
      <Text variant="footnote" tone="subtle" tabular>
        {formatTime(log.startTime)}
      </Text>
      {side ? (
        <Pill bg={tone.soft} fg={tone.text}>
          {side}
        </Pill>
      ) : null}
      {log.amountMl !== null && (
        <Pill emoji={MEASURE_EMOJI.volume} bg={t.infoSoft} fg={t.info}>
          {units.formatVolume(log.amountMl)}
        </Pill>
      )}
      {log.durationMinutes ? (
        <Text variant="footnote" tone="muted">
          {formatDuration(log.durationMinutes)}
        </Text>
      ) : null}
    </View>
  );
}

/** The website's badge pill: pastel fill, small bold text, tiny emoji. */
function Pill({
  emoji,
  children,
  bg,
  fg,
}: {
  emoji?: string;
  children: React.ReactNode;
  bg: string;
  fg: string;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {emoji ? <Emoji size={11}>{emoji}</Emoji> : null}
      <Text variant="caption" style={{ color: fg }}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  cards: { gap: space.md },
  dayList: { gap: space.sm },
  dayHead: { padding: space.lg, gap: space.sm },
  dayTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  bar: {
    flexDirection: "row",
    height: space.sm,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
  },
  detail: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    gap: space.lg,
  },
  detailBlock: { gap: space.xs },
  detailHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    marginBottom: space.xxs,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.sm,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
  },
});
