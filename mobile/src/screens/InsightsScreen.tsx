import React, { useCallback, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type DimensionValue,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import Svg, { Circle, Polyline } from "react-native-svg";
import { useTheme } from "../design/ThemeProvider";
import { space, radius } from "../design/tokens";
import {
  useActivityTones,
  useActivityTone,
  MEASURE_EMOJI,
} from "../design/activity";
import {
  Screen,
  ScreenHeader,
  SectionHeader,
  Card,
  Text,
  Emoji,
  Button,
  Input,
  Field,
  Sheet,
  Segmented,
  SkeletonList,
  EmptyState,
} from "../components/ui";
import { useToast } from "../components/Toast";
import { useUnits } from "../context/SettingsContext";
import { useLogs } from "../hooks/useLogs";
import { useBaby } from "../context/BabyContext";
import { useAuth } from "../context/AuthContext";
import BabySwitcher from "../components/BabySwitcher";
import StatCard from "../components/StatCard";
import { formatMinutes } from "../utils/formatDuration";
import { formatDateLabel } from "../utils/formatTime";
import { overlapMinutes } from "../lib/dayMath";
import { findRhythms, describeRhythm, MIN_DAYS } from "../lib/rhythms";
import { createLog, type LogEntry } from "../api/logs";

/* -------------------------------------------------------------------------- */
/* Day aggregation                                                             */
/* -------------------------------------------------------------------------- */

interface DayStats {
  dateKey: string;
  dayStart: Date;
  dateLabel: string;
  feedTime: number;
  feedCount: number;
  pumpMl: number;
  pumpCount: number;
  sleepTime: number;
  sleepCount: number;
  diaperCount: number;
  showerCount: number;
  vitaminCount: number;
  nailcutCount: number;
  healthCount: number;
  totalLogs: number;
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function computeAllDayStats(logs: LogEntry[]): DayStats[] {
  const groups = new Map<string, LogEntry[]>();
  for (const log of logs) {
    const key = new Date(log.startTime).toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(log);
  }

  const results: DayStats[] = [];
  for (const [dateKey, dayLogs] of groups) {
    const anchor = new Date(dayLogs[0].startTime);
    const dayStart = new Date(
      anchor.getFullYear(),
      anchor.getMonth(),
      anchor.getDate()
    );
    // Time totals count only the portion of each log falling on THIS day, so
    // an overnight sleep splits across the days it spans. Scans all logs so a
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

    results.push({
      dateKey,
      dayStart,
      dateLabel: formatDateShort(dayStart),
      feedTime: totalTime("feed"),
      feedCount: count("feed"),
      pumpMl: totalMl("pump"),
      pumpCount: count("pump"),
      sleepTime: totalTime("sleep"),
      sleepCount: count("sleep"),
      diaperCount: count("diaper"),
      showerCount: count("shower"),
      vitaminCount: count("vitamin"),
      nailcutCount: count("nailcut"),
      healthCount: count("health"),
      totalLogs: dayLogs.length,
    });
  }

  return results;
}

/* -------------------------------------------------------------------------- */

type Window = "7" | "30" | "all";

const WINDOW_OPTIONS: { value: Window; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "all", label: "All" },
];

const DATE_OPTIONS = [
  { value: "today" as const, label: "Today" },
  { value: "custom" as const, label: "Another date" },
];

function formatDateDisplay(d: Date): string {
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** The chosen calendar day, stamped with the current clock time. */
function onDateWithCurrentClock(day: Date): Date {
  const now = new Date();
  const result = new Date(day);
  result.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
  return result;
}

/**
 * Growth and patterns, in one place.
 *
 * Weight, height and their trajectory sit above the activity trends because
 * both answer the same parental question — "is she doing well over time?" —
 * where the Log answers "what happened". Individual measurements are edited
 * from the Log tab like any other entry.
 */
/**
 * Which activities are worth describing as a routine, and the verb each one
 * takes so the sentence reads naturally. A nappy change has no rhythm worth
 * reporting — they happen whenever they happen — so it isn't listed.
 */
const RHYTHM_ACTIVITIES: { type: string; verb: string; emoji: string }[] = [
  { type: "sleep", verb: "Sleeps", emoji: "😴" },
  { type: "feed", verb: "Feeds", emoji: "🤱" },
  { type: "pump", verb: "Pumping", emoji: "🍼" },
  { type: "shower", verb: "Showers", emoji: "🚿" },
  { type: "bath", verb: "Baths", emoji: "🛁" },
  { type: "vitamin", verb: "Vitamin", emoji: "💊" },
];

/**
 * "Sleeps between 9:00 and 10:30 PM for about 2h."
 *
 * Learned from the baby's own history rather than configured: once an activity
 * has happened on a few separate days at a consistent hour, that hour is worth
 * saying out loud. Activities without enough history simply don't appear, so
 * the section grows into usefulness instead of showing empty rows.
 */
function DailyRhythms({ logs }: { logs: LogEntry[] }) {
  const t = useTheme();

  const found = useMemo(
    () =>
      RHYTHM_ACTIVITIES.map((activity) => ({
        ...activity,
        rhythms: findRhythms(logs, activity.type),
      })).filter((a) => a.rhythms.length > 0),
    [logs]
  );

  if (found.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title="Daily rhythm" />
      <Card style={styles.rhythmCard}>
        {found.map((activity, activityIndex) => (
          <View key={activity.type} style={styles.rhythmGroup}>
            {activityIndex > 0 ? (
              <View style={[styles.rhythmRule, { backgroundColor: t.border }]} />
            ) : null}
            {activity.rhythms.map((rhythm, i) => {
              const { lead, detail } = describeRhythm(activity.verb, rhythm);
              return (
                <View key={`${activity.type}-${i}`} style={styles.rhythmRow}>
                  <Emoji size={18}>{activity.emoji}</Emoji>
                  <View style={styles.flex}>
                    <Text variant="subheadStrong">{lead}</Text>
                    <Text variant="caption" tone="subtle">
                      {detail}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </Card>
      <Text variant="footnote" tone="subtle">
        Averages from the last few weeks. A pattern appears once it has happened
        on at least {MIN_DAYS} separate days.
      </Text>
    </View>
  );
}

export default function InsightsScreen() {
  const t = useTheme();
  const tones = useActivityTones();
  const growthTone = useActivityTone("growth");
  const units = useUnits();
  const toast = useToast();
  const { activeBaby } = useBaby();
  const { account } = useAuth();
  const { logs, loading, refresh } = useLogs("all");
  const [refreshing, setRefreshing] = useState(false);
  const [window, setWindow] = useState<Window>("7");

  // Log-measurement sheet
  const [showForm, setShowForm] = useState(false);
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [dateChoice, setDateChoice] = useState<"today" | "custom">("today");
  const [customDate, setCustomDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  /* ------------------------------------------------------------- growth */

  const growthLogs = useMemo(
    () =>
      logs
        .filter((l) => l.type === "growth")
        .sort(
          (a, b) =>
            new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        ),
    [logs]
  );
  const weightEntries = useMemo(
    () => growthLogs.filter((l) => l.weightKg !== null),
    [growthLogs]
  );
  const heightEntries = useMemo(
    () => growthLogs.filter((l) => l.heightCm !== null),
    [growthLogs]
  );
  const latestWeight = weightEntries[weightEntries.length - 1] ?? null;
  const prevWeight = weightEntries[weightEntries.length - 2] ?? null;
  const latestHeight = heightEntries[heightEntries.length - 1] ?? null;
  const prevHeight = heightEntries[heightEntries.length - 2] ?? null;

  const weightDelta =
    latestWeight?.weightKg != null && prevWeight?.weightKg != null
      ? latestWeight.weightKg - prevWeight.weightKg
      : null;
  const heightDelta =
    latestHeight?.heightCm != null && prevHeight?.heightCm != null
      ? latestHeight.heightCm - prevHeight.heightCm
      : null;

  /* -------------------------------------------------------------- trends */

  const allDays = useMemo(() => computeAllDayStats(logs), [logs]);

  const windowedDays = useMemo(() => {
    if (window === "all") return allDays;
    const cutoff = Date.now() - parseInt(window, 10) * 86_400_000;
    return allDays.filter((d) => d.dayStart.getTime() >= cutoff);
  }, [allDays, window]);

  const { todayStats, avg, totals } = useMemo(() => {
    const todayKey = new Date().toDateString();
    const today = allDays.find((d) => d.dateKey === todayKey);
    const count = windowedDays.length || 1;
    const sum = (fn: (d: DayStats) => number) =>
      windowedDays.reduce((s, d) => s + fn(d), 0);
    return {
      todayStats: today,
      avg: {
        feedTime: sum((d) => d.feedTime) / count,
        pumpMl: sum((d) => d.pumpMl) / count,
        sleepTime: sum((d) => d.sleepTime) / count,
        diaperCount: sum((d) => d.diaperCount) / count,
      },
      totals: {
        feedTime: sum((d) => d.feedTime),
        feedCount: sum((d) => d.feedCount),
        pumpMl: sum((d) => d.pumpMl),
        pumpCount: sum((d) => d.pumpCount),
        sleepTime: sum((d) => d.sleepTime),
        sleepCount: sum((d) => d.sleepCount),
        diaperCount: sum((d) => d.diaperCount),
        totalLogs: sum((d) => d.totalLogs),
      },
    };
  }, [allDays, windowedDays]);

  // Sleep-per-day bars: always the last 7 calendar days so the shape of the
  // week is comparable at a glance whatever the averages window is set to.
  const sleepBars = useMemo(() => {
    const bars: { label: string; minutes: number; isToday: boolean }[] = [];
    const byKey = new Map(allDays.map((d) => [d.dateKey, d]));
    for (let ago = 6; ago >= 0; ago -= 1) {
      const day = new Date(Date.now() - ago * 86_400_000);
      const stat = byKey.get(day.toDateString());
      bars.push({
        label: day.toLocaleDateString([], { weekday: "narrow" }),
        minutes: stat?.sleepTime ?? 0,
        isToday: ago === 0,
      });
    }
    return bars;
  }, [allDays]);
  const maxSleep = Math.max(1, ...sleepBars.map((b) => b.minutes));
  const sleepAvg =
    sleepBars.reduce((s, b) => s + b.minutes, 0) /
    Math.max(1, sleepBars.filter((b) => b.minutes > 0).length);

  /* ---------------------------------------------------------------- form */

  const resetForm = () => {
    setShowForm(false);
    setWeight("");
    setHeight("");
    setNotes("");
    setDateChoice("today");
    setCustomDate(new Date());
    setShowDatePicker(false);
  };

  const handleSave = async () => {
    if (!weight && !height) {
      toast.error("Enter a weight or a height.");
      return;
    }
    if (!activeBaby) return;
    setSaving(true);
    const at = (
      dateChoice === "today" ? new Date() : onDateWithCurrentClock(customDate)
    ).toISOString();
    try {
      await createLog({
        babyId: activeBaby.id,
        type: "growth",
        weightKg: weight ? units.parseWeight(weight) : null,
        heightCm: height ? units.parseHeight(height) : null,
        startTime: at,
        endTime: at,
        comments: notes.trim() || null,
        enteredByName: account?.name || "Unknown",
      });
      await refresh();
      resetForm();
    } catch (err) {
      toast.showError(err);
    } finally {
      setSaving(false);
    }
  };

  if (!activeBaby) {
    return (
      <Screen scroll={false}>
        <EmptyState
          icon="analytics"
          title="No baby selected"
          body="Choose a baby to see growth and activity patterns."
        />
        <View style={styles.center}>
          <BabySwitcher />
        </View>
      </Screen>
    );
  }

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <ScreenHeader
        title="Analytics"
        subtitle={`Growth & patterns · ${activeBaby.name}`}
        actions={<BabySwitcher />}
      />

      {loading ? (
        <SkeletonList rows={4} />
      ) : (
        <>
          <DailyRhythms logs={logs} />
          {/* ------------------------------------------------------ growth */}
          <View style={styles.section}>
            <SectionHeader
              title="Growth"
              action={
                <Pressable
                  onPress={() => {
                    setShowForm(true);
                    setDateChoice("today");
                    setCustomDate(new Date());
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Log a new weight or height measurement"
                >
                  <Text variant="subheadStrong" tone="accent">
                    ＋ Log measurement
                  </Text>
                </Pressable>
              }
            />

            <View style={styles.growthRow}>
              <GrowthTile
                emoji={MEASURE_EMOJI.weight}
                soft={growthTone.soft}
                valueColor={growthTone.text}
                value={
                  latestWeight?.weightKg != null
                    ? units.formatWeight(latestWeight.weightKg)
                    : "—"
                }
                caption={
                  weightDelta != null && prevWeight
                    ? `${weightDelta >= 0 ? "+" : "−"}${units.formatWeight(
                        Math.abs(weightDelta)
                      )} since ${formatDateLabel(prevWeight.startTime)}`
                    : latestWeight
                      ? `Last: ${formatDateLabel(latestWeight.startTime)}`
                      : "No data yet"
                }
                name="Weight"
              />
              <GrowthTile
                emoji={MEASURE_EMOJI.height}
                soft={growthTone.soft}
                valueColor={growthTone.text}
                value={
                  latestHeight?.heightCm != null
                    ? units.formatHeight(latestHeight.heightCm)
                    : "—"
                }
                caption={
                  heightDelta != null && prevHeight
                    ? `${heightDelta >= 0 ? "+" : "−"}${units.formatHeight(
                        Math.abs(heightDelta)
                      )} since ${formatDateLabel(prevHeight.startTime)}`
                    : latestHeight
                      ? `Last: ${formatDateLabel(latestHeight.startTime)}`
                      : "No data yet"
                }
                name="Height"
              />
            </View>

            {weightEntries.length >= 2 && (
              <WeightChart
                entries={weightEntries.slice(-6)}
                color={growthTone.main}
                formatWeight={units.formatWeight}
              />
            )}
          </View>

          {/* ----------------------------------------------- sleep pattern */}
          <View style={styles.section}>
            <SectionHeader title="Sleep, last 7 days" />
            <Card>
              <View style={styles.chartHead}>
                <View style={styles.rowCenter}>
                  <Emoji size={16}>{tones.sleep.emoji}</Emoji>
                  <Text variant="subheadStrong">Sleep per day</Text>
                </View>
                <Text variant="caption" tone="subtle">
                  avg{" "}
                  <Text
                    variant="caption"
                    tabular
                    style={{ color: tones.sleep.text, fontWeight: "700" }}
                  >
                    {formatMinutes(Math.round(sleepAvg || 0))}
                  </Text>
                </Text>
              </View>
              <View
                style={styles.bars}
                accessible
                accessibilityLabel={`Sleep per day over the last week: ${sleepBars
                  .map((b) => `${b.label} ${formatMinutes(b.minutes)}`)
                  .join(", ")}`}
              >
                {sleepBars.map((bar, i) => (
                  <View key={i} style={styles.barCol}>
                    <Text variant="caption" tone="subtle" tabular style={styles.barVal}>
                      {bar.minutes > 0 ? formatMinutes(bar.minutes) : ""}
                    </Text>
                    {/* The track is what the bar's percentage is measured
                        against. Sizing the bar against the whole column left
                        the tallest one no room for its own labels, which then
                        overflowed upward across the card header. */}
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.bar,
                          {
                            height: `${Math.max(
                              4,
                              (bar.minutes / maxSleep) * 100
                            )}%` as DimensionValue,
                            backgroundColor: bar.isToday
                              ? tones.sleep.main
                              : tones.sleep.border,
                          },
                        ]}
                      />
                    </View>
                    <Text variant="caption" tone="subtle">
                      {bar.label}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          </View>

          {/* -------------------------------------------- activity averages */}
          <View style={styles.section}>
            <SectionHeader
              title="Activity averages"
              action={
                <Text variant="caption" tone="subtle">
                  {windowedDays.length} day{windowedDays.length !== 1 ? "s" : ""} ·{" "}
                  {totals.totalLogs} logs
                </Text>
              }
            />
            <Segmented options={WINDOW_OPTIONS} value={window} onChange={setWindow} />

            <View style={styles.cards}>
              <StatCard
                icon={tones.feed.emoji}
                type="feed"
                label="Feeding"
                today={formatMinutes(todayStats?.feedTime ?? 0)}
                avg={formatMinutes(Math.round(avg.feedTime))}
                total={formatMinutes(totals.feedTime)}
                totalCount={totals.feedCount}
              />
              <StatCard
                icon={tones.pump.emoji}
                type="pump"
                label="Pumping"
                today={units.formatVolume(todayStats?.pumpMl ?? 0)}
                avg={units.formatVolume(avg.pumpMl)}
                total={units.formatVolume(totals.pumpMl)}
                totalCount={totals.pumpCount}
              />
              <StatCard
                icon={tones.sleep.emoji}
                type="sleep"
                label="Sleep"
                today={formatMinutes(todayStats?.sleepTime ?? 0)}
                avg={formatMinutes(Math.round(avg.sleepTime))}
                total={formatMinutes(totals.sleepTime)}
                totalCount={totals.sleepCount}
              />
              <StatCard
                icon={tones.diaper.emoji}
                type="diaper"
                label="Diapers"
                today={String(todayStats?.diaperCount ?? 0)}
                avg={avg.diaperCount.toFixed(1)}
                total={String(totals.diaperCount)}
              />
            </View>
          </View>
        </>
      )}

      {/* ------------------------------------------------ measurement form */}
      <Sheet
        visible={showForm}
        onClose={resetForm}
        title="New measurement"
        subtitle={`Logging for ${activeBaby.name}`}
        footer={
          <View style={styles.actions}>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={resetForm}
              style={styles.flex}
            />
            <Button
              label="Save"
              variant="primary"
              loading={saving}
              disabled={!weight && !height}
              onPress={handleSave}
              style={styles.flex}
            />
          </View>
        }
      >
        <Field
          label="Date"
          helper="Measurements taken earlier keep the current clock time."
        >
          <Segmented
            options={DATE_OPTIONS}
            value={dateChoice}
            onChange={setDateChoice}
          />
        </Field>

        {dateChoice === "custom" && (
          <>
            <Field label="Day">
              <Pressable
                onPress={() => setShowDatePicker(true)}
                accessibilityRole="button"
                accessibilityLabel={`Day: ${formatDateDisplay(customDate)}`}
                style={({ pressed }) => [
                  styles.pickerBtn,
                  {
                    backgroundColor: t.accentSofter,
                    borderColor: t.borderStrong,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text variant="body">{formatDateDisplay(customDate)}</Text>
              </Pressable>
            </Field>
            {showDatePicker && (
              <DateTimePicker
                value={customDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, d) => {
                  setShowDatePicker(Platform.OS === "ios");
                  if (d) setCustomDate(d);
                }}
              />
            )}
          </>
        )}

        <Input
          label="Weight"
          suffix={units.weight}
          value={weight}
          onChangeText={setWeight}
          placeholder={units.system === "metric" ? "4.5" : "9.9"}
          keyboardType="decimal-pad"
        />

        <Input
          label="Height"
          suffix={units.height}
          value={height}
          onChangeText={setHeight}
          placeholder={units.system === "metric" ? "52" : "20.5"}
          keyboardType="decimal-pad"
        />

        <Input
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
        />
      </Sheet>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */

/** One current-measurement tile. Read as a whole so the number has its unit. */
function GrowthTile({
  emoji,
  soft,
  value,
  valueColor,
  caption,
  name,
}: {
  emoji: string;
  soft: string;
  value: string;
  valueColor: string;
  caption: string;
  name: string;
}) {
  return (
    <Card
      style={styles.growthTile}
      accessible
      accessibilityLabel={`${name}: ${value}. ${caption}`}
    >
      <View style={[styles.growthIcon, { backgroundColor: soft }]}>
        <Emoji size={20}>{emoji}</Emoji>
      </View>
      <Text variant="title2" tabular center style={{ color: valueColor }}>
        {value}
      </Text>
      <Text variant="caption" tone="subtle" center numberOfLines={1}>
        {caption}
      </Text>
    </Card>
  );
}

const CHART_W = 320;
const CHART_H = 120;
const CHART_PAD = 14;

/**
 * Weight over the last few measurements. Decorative summary — the exact
 * figures are in the labels beneath and on each Log entry — so the SVG itself
 * is hidden from screen readers in favour of one spoken sentence.
 */
function WeightChart({
  entries,
  color,
  formatWeight,
}: {
  entries: LogEntry[];
  color: string;
  formatWeight: (kg: number) => string;
}) {
  const values = entries.map((e) => e.weightKg ?? 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(0.1, max - min);

  const points = values.map((v, i) => {
    const x =
      CHART_PAD + (i * (CHART_W - CHART_PAD * 2)) / Math.max(1, values.length - 1);
    const y = CHART_H - CHART_PAD - ((v - min) / span) * (CHART_H - CHART_PAD * 2);
    return { x, y };
  });

  const first = entries[0];
  const last = entries[entries.length - 1];

  return (
    <Card
      accessible
      accessibilityLabel={`Weight trend: from ${formatWeight(
        first.weightKg ?? 0
      )} on ${formatDateLabel(first.startTime)} to ${formatWeight(
        last.weightKg ?? 0
      )} on ${formatDateLabel(last.startTime)}`}
    >
      <View style={styles.chartHead}>
        <View style={styles.rowCenter}>
          <Emoji size={16}>{MEASURE_EMOJI.weight}</Emoji>
          <Text variant="subheadStrong">Weight</Text>
        </View>
        <Text variant="caption" tone="subtle">
          last {entries.length} measurements
        </Text>
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Svg
          width="100%"
          height={CHART_H}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
        >
          <Polyline
            points={points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((p, i) => (
            <Circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={i === points.length - 1 ? 5 : 4}
              fill={i === points.length - 1 ? color : "#ffffff"}
              stroke={color}
              strokeWidth={2.5}
            />
          ))}
        </Svg>
        <View style={styles.chartLabels}>
          <Text variant="caption" tone="subtle" tabular>
            {formatDateLabel(first.startTime)} · {formatWeight(first.weightKg ?? 0)}
          </Text>
          <Text variant="caption" tabular style={{ color, fontWeight: "700" }}>
            {formatDateLabel(last.startTime)} · {formatWeight(last.weightKg ?? 0)}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: "center" },
  section: { gap: space.sm },
  rhythmCard: { gap: space.sm },
  rhythmGroup: { gap: space.sm },
  rhythmRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  rhythmRule: { height: StyleSheet.hairlineWidth, marginVertical: space.xxs },
  cards: { gap: space.md },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: space.sm },
  actions: { flexDirection: "row", gap: space.sm },
  growthRow: { flexDirection: "row", gap: space.md },
  growthTile: { flex: 1, alignItems: "center", gap: space.xs },
  growthIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  chartHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  chartLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: space.xs,
  },
  // No fixed height: the row is as tall as a column needs, which is the track
  // plus the label above it and the day beneath.
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
  },
  barCol: {
    flex: 1,
    alignItems: "center",
    gap: space.xs,
  },
  // The bar is sized as a percentage, so it needs a parent with a height of its
  // own. This is that parent, and it holds nothing else.
  barTrack: {
    width: "100%",
    height: 110,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  barVal: { fontSize: 10 },
  bar: {
    width: "100%",
    maxWidth: 26,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
  },
  pickerBtn: {
    borderRadius: radius.md,
    borderWidth: 2,
    paddingHorizontal: space.md,
    minHeight: 48,
    justifyContent: "center",
  },
});
