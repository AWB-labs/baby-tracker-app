import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../design/ThemeProvider";
import { useActivityTone, DIAPER_META } from "../design/activity";
import { space, radius } from "../design/tokens";
import { Icon } from "../design/icons";
import { PressableCard, Text, Emoji } from "./ui";
import { formatTime, formatTimer, formatRelativeTime } from "../utils/formatTime";
import { formatDuration } from "../utils/formatDuration";
import { summarise } from "../lib/greeting";
import { useUnits } from "../context/SettingsContext";
import type { LogEntry, MilkBalance } from "../api/logs";
import type { UseTimerResult } from "../hooks/useTimer";

interface Props {
  logs: LogEntry[];
  /** True while the first fetch for this baby is still in flight. */
  loading?: boolean;
  feedTimer: UseTimerResult;
  sleepTimer: UseTimerResult;
  /** Open the Log tab, optionally pre-filtered to one activity. */
  onOpenLog: (filter?: string) => void;
  /** Open the Insights tab. */
  onOpenInsights: () => void;
  /**
   * Pumped minus bottled. When there's a pump history to show (`pumpedMl >
   * 0`), it takes over the fourth card instead of the day-so-far summary —
   * a running balance is closer in kind to "last feed"/"last sleep" than a
   * once-a-day tally is, and a family that pumps checks it just as often.
   * Falls back to the day summary otherwise, so a family with no pump
   * history doesn't lose that card.
   */
  milkBalance?: MilkBalance | null;
  /** Open the balance-correction sheet. */
  onOpenMilkBalance?: () => void;
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

/**
 * The answer to "how are we doing right now", in four tappable cards.
 *
 * This replaces the old stack of banners: each card is a door, not a notice —
 * feed, sleep and diaper open the Log filtered to that activity, and the
 * day-so-far card opens Insights. While a feed or sleep is running its card
 * switches to the live timer, so the screen never shows a stale "1h ago"
 * beside an activity that is happening.
 */
export default function Snapshot({
  logs,
  loading = false,
  feedTimer,
  sleepTimer,
  onOpenLog,
  onOpenInsights,
  milkBalance,
  onOpenMilkBalance,
}: Props) {
  const t = useTheme();
  const units = useUnits();
  /*
   * Only the very first load holds the cards back. A poll or a pull-to-refresh
   * arrives with the previous numbers still on screen, and blanking those to
   * placeholders every thirty seconds would be worse than briefly showing a
   * value that is a moment out of date.
   */
  const pending = loading && logs.length === 0;
  const feedTone = useActivityTone("feed");
  const sleepTone = useActivityTone("sleep");
  const diaperTone = useActivityTone("diaper");

  // Relative labels round to the minute; tick just often enough to stay honest.
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const lastFeed = useMemo(() => latestOfType(logs, "feed"), [logs]);
  const lastSleep = useMemo(() => latestOfType(logs, "sleep"), [logs]);
  const lastDiaper = useMemo(() => latestOfType(logs, "diaper"), [logs]);
  const today = useMemo(() => summarise(logs), [logs]);

  const feedSide =
    feedTimer.activeSide === "left"
      ? "Left"
      : feedTimer.activeSide === "right"
        ? "Right"
        : null;
  const lastFeedSide =
    lastFeed?.side === "left" ? "Left" : lastFeed?.side === "right" ? "Right" : null;
  const diaperMeta = lastDiaper?.diaperStatus
    ? DIAPER_META[lastDiaper.diaperStatus]
    : null;

  const todayLine =
    today.feeds > 0 || today.diapers > 0
      ? `${today.feeds} feed${today.feeds === 1 ? "" : "s"} · ${today.diapers} diaper${
          today.diapers === 1 ? "" : "s"
        }`
      : "Nothing yet";
  const todaySleepLine =
    today.sleepMinutes > 0
      ? `${formatDuration(today.sleepMinutes)} sleep so far`
      : "The day is young";

  // Hidden until there's a pump history to show — a formula-only family
  // shouldn't have their day-so-far card replaced by "0 ml available".
  const showMilkBalance =
    !!milkBalance && milkBalance.pumpedMl > 0 && !!onOpenMilkBalance;
  const availableMl = showMilkBalance
    ? Math.max(0, milkBalance!.balanceMl)
    : 0;

  return (
    <View style={styles.grid}>
      {/* ---------------------------------------------------------- feed */}
      <SnapshotCard
        pending={pending}
        emoji={feedTone.emoji}
        label={feedTimer.isActive ? "Feed" : "Last feed"}
        value={
          feedTimer.isActive
            ? formatTimer(feedTimer.elapsed)
            : lastFeed
              ? formatRelativeTime(lastFeed.startTime)
              : "None yet"
        }
        valueColor={feedTone.text}
        sub={
          feedTimer.isActive
            ? null
            : lastFeed
              ? [formatTime(lastFeed.startTime), lastFeedSide]
                  .filter(Boolean)
                  .join(" · ")
              : "Tap to see feeds"
        }
        live={
          feedTimer.isActive
            ? feedTimer.paused
              ? "Paused"
              : `Feeding${feedSide ? ` · ${feedSide}` : ""}`
            : null
        }
        accessibilityLabel={
          feedTimer.isActive
            ? `Feeding now, ${Math.floor(feedTimer.elapsed / 60)} minutes${
                feedSide ? `, ${feedSide} side` : ""
              }. Opens the feed log.`
            : lastFeed
              ? `Last feed ${formatRelativeTime(lastFeed.startTime)}${
                  lastFeedSide ? `, ${lastFeedSide} side` : ""
                }. Opens the feed log.`
              : "No feeds yet. Opens the feed log."
        }
        onPress={() => onOpenLog("feed")}
      />

      {/* --------------------------------------------------------- sleep */}
      <SnapshotCard
        pending={pending}
        emoji={sleepTone.emoji}
        label={sleepTimer.isActive ? "Sleep" : "Last sleep"}
        value={
          sleepTimer.isActive
            ? formatTimer(sleepTimer.elapsed)
            : lastSleep
              ? formatRelativeTime(lastSleep.startTime)
              : "None yet"
        }
        valueColor={sleepTone.text}
        sub={
          sleepTimer.isActive
            ? null
            : lastSleep
              ? [
                  formatTime(lastSleep.startTime),
                  lastSleep.durationMinutes
                    ? formatDuration(lastSleep.durationMinutes)
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Tap to see naps"
        }
        live={
          sleepTimer.isActive
            ? sleepTimer.paused
              ? "Paused"
              : "Napping now"
            : null
        }
        accessibilityLabel={
          sleepTimer.isActive
            ? `Napping now, ${Math.floor(
                sleepTimer.elapsed / 60
              )} minutes. Opens the sleep log.`
            : lastSleep
              ? `Last sleep ${formatRelativeTime(
                  lastSleep.startTime
                )}. Opens the sleep log.`
              : "No sleeps yet. Opens the sleep log."
        }
        onPress={() => onOpenLog("sleep")}
      />

      {/* -------------------------------------------------------- diaper */}
      <SnapshotCard
        pending={pending}
        emoji={diaperTone.emoji}
        label="Last diaper"
        value={lastDiaper ? formatRelativeTime(lastDiaper.startTime) : "None yet"}
        valueColor={diaperTone.text}
        sub={
          lastDiaper
            ? [
                formatTime(lastDiaper.startTime),
                diaperMeta ? `${diaperMeta.emoji} ${diaperMeta.label}` : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : "Tap to see changes"
        }
        accessibilityLabel={
          lastDiaper
            ? `Last diaper ${formatRelativeTime(lastDiaper.startTime)}${
                diaperMeta ? `, ${diaperMeta.label}` : ""
              }. Opens the diaper log.`
            : "No diaper changes yet. Opens the diaper log."
        }
        onPress={() => onOpenLog("diaper")}
      />

      {/* ------------------------------------------------- today / balance */}
      {showMilkBalance ? (
        <SnapshotCard
          pending={pending}
          emoji="🍼"
          label="Milk balance"
          value={units.formatVolume(availableMl)}
          valueColor={t.accentText}
          sub="Available · tap to correct"
          accessibilityLabel={`${units.formatVolume(availableMl)} of pumped milk available. Tap to correct it.`}
          onPress={onOpenMilkBalance!}
        />
      ) : (
        <SnapshotCard
          pending={pending}
          emoji="✨"
          label="Today"
          value={todayLine}
          valueColor={t.text}
          valueSmall
          sub={todaySleepLine}
          accessibilityLabel={`Today so far: ${todayLine}, ${todaySleepLine}. Opens Insights.`}
          onPress={onOpenInsights}
        />
      )}
    </View>
  );
}

function SnapshotCard({
  emoji,
  label,
  value,
  valueColor,
  valueSmall = false,
  sub,
  live = null,
  pending = false,
  accessibilityLabel,
  onPress,
}: {
  emoji: string;
  label: string;
  value: string;
  valueColor: string;
  valueSmall?: boolean;
  sub: string | null;
  live?: string | null;
  /** First fetch still in flight: hold the card's shape, not its content. */
  pending?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const t = useTheme();
  // A placeholder rather than "None yet", which would be a claim about data we
  // haven't loaded — and rather than nothing, which would change the card's
  // height the instant it arrived.
  if (pending) {
    value = "—";
    sub = " ";
    live = null;
  }
  return (
    <PressableCard
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={styles.card}
    >
      <View style={styles.top}>
        <View style={styles.labelRow}>
          <Emoji size={14}>{emoji}</Emoji>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {label}
          </Text>
        </View>
        <Icon name="chevronRight" size="sm" color={t.textSubtle} />
      </View>

      <Text
        variant={valueSmall ? "subheadStrong" : "title3"}
        tabular
        numberOfLines={1}
        style={{ color: valueColor }}
      >
        {value}
      </Text>

      {live ? (
        <View style={styles.liveRow}>
          <View style={[styles.liveDot, { backgroundColor: t.success }]} />
          <Text variant="caption" style={{ color: t.success, fontWeight: "700" }}>
            {live}
          </Text>
        </View>
      ) : sub ? (
        <Text variant="caption" tone="subtle" tabular numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </PressableCard>
  );
}


const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.md,
  },
  card: {
    // Two per row: half the width minus half the gap.
    flexBasis: "47%",
    flexGrow: 1,
    padding: space.md,
    gap: space.xxs,
    minHeight: 84,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    flexShrink: 1,
  },
  liveRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  liveDot: { width: 7, height: 7, borderRadius: radius.pill },
});
