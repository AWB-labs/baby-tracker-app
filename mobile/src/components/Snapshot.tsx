import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../design/ThemeProvider";
import { useActivityTone, DIAPER_META } from "../design/activity";
import { space } from "../design/tokens";
import { Icon } from "../design/icons";
import { PressableCard, Text, Emoji } from "./ui";
import { formatTime, formatRelativeTime } from "../utils/formatTime";
import { formatDuration } from "../utils/formatDuration";
import { useUnits } from "../context/SettingsContext";
import type { LogEntry } from "../api/logs";

/**
 * When a timed activity is in progress — by anyone, on any device — the
 * moment it began. While one is running, its card's "last … ago" is frozen
 * as of that moment: mid-feed, "last feed 1h ago" should keep answering "how
 * long was the gap before this feed", not silently count through the feed
 * itself, and it picks the clock back up the moment the session ends.
 */
export interface ActiveStarts {
  feed?: Date | null;
  sleep?: Date | null;
  pump?: Date | null;
}

interface Props {
  logs: LogEntry[];
  /** True while the first fetch for this baby is still in flight. */
  loading?: boolean;
  /** Open the Log tab, optionally pre-filtered to one activity. */
  onOpenLog: (filter?: string) => void;
  /** In-progress sessions, for freezing the relative labels — see above. */
  activeStarts?: ActiveStarts;
}

/**
 * Diaper status, shortened for the snapshot card only.
 *
 * "Wet & Dirty" alongside a timestamp and two emoji overruns a card that is
 * half the screen wide, and the ellipsis lands mid-phrase — "Wet &…" reads as
 * though the app doesn't know the rest. "Both" is what the feed card above
 * already says when a feed used both sides, so the word is established on
 * this exact grid, and the two emoji beside it spell out which both.
 *
 * Deliberately local rather than a change to DIAPER_META: the pickers and the
 * activity list have the room, and "Both" on its own in a list of options
 * would be a worse label than the full phrase.
 */
const SNAPSHOT_DIAPER_LABEL: Record<string, string> = {
  wet_and_dirty: "Both",
};

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
 * feed, pump, sleep and diaper all open the Log filtered to that activity.
 * The cards always read "last one was…", never a live running clock — that
 * clock already lives, bigger and with its own controls, in the Track row
 * below; duplicating it up here just to save a glance conflicted with the
 * row's own centred timer instead of matching it.
 */
export default function Snapshot({
  logs,
  loading = false,
  onOpenLog,
  activeStarts,
}: Props) {
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
  const pumpTone = useActivityTone("pump");

  // Relative labels round to the minute; tick just often enough to stay honest.
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const lastFeed = useMemo(() => latestOfType(logs, "feed"), [logs]);
  const lastSleep = useMemo(() => latestOfType(logs, "sleep"), [logs]);
  const lastDiaper = useMemo(() => latestOfType(logs, "diaper"), [logs]);
  const lastPump = useMemo(() => latestOfType(logs, "pump"), [logs]);

  // While an activity is running, its "ago" is measured to the session's
  // start rather than to now — see ActiveStarts.
  const feedAsOf = activeStarts?.feed?.getTime();
  const sleepAsOf = activeStarts?.sleep?.getTime();
  const pumpAsOf = activeStarts?.pump?.getTime();

  // "Both" when the feed switched breasts — `side` alone records only where
  // it ended, so it would under-report a feed mostly spent on the other one.
  const lastFeedSide =
    lastFeed?.leftMinutes != null && lastFeed?.rightMinutes != null
      ? "Both"
      : lastFeed?.side === "left"
        ? "Left"
        : lastFeed?.side === "right"
          ? "Right"
          : null;
  const diaperMeta = lastDiaper?.diaperStatus
    ? DIAPER_META[lastDiaper.diaperStatus]
    : null;

  // "120 ml" for a measured pump, else which side it was — the same facts
  // the Track row's idle line leads with.
  const lastPumpDetail = lastPump
    ? lastPump.amountMl != null
      ? units.formatVolume(lastPump.amountMl)
      : lastPump.leftMinutes != null && lastPump.rightMinutes != null
        ? "L+R"
        : lastPump.side === "left"
          ? "L"
          : lastPump.side === "right"
            ? "R"
            : null
    : null;

  return (
    <View style={styles.grid}>
      {/* ---------------------------------------------------------- feed */}
      <SnapshotCard
        pending={pending}
        emoji={feedTone.emoji}
        label="Last feed"
        value={
          lastFeed ? formatRelativeTime(lastFeed.startTime, feedAsOf) : "None yet"
        }
        valueColor={feedTone.text}
        sub={
          lastFeed
            ? [formatTime(lastFeed.startTime), lastFeedSide]
                .filter(Boolean)
                .join(" · ")
            : "Tap to see feeds"
        }
        accessibilityLabel={
          lastFeed
            ? `Last feed ${formatRelativeTime(lastFeed.startTime, feedAsOf)}${
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
        label="Last sleep"
        value={
          lastSleep
            ? // Counted from when it ended, not when it started — "how long
              // has the baby been awake" is the useful question, and for an
              // hours-long nap those are very different numbers.
              formatRelativeTime(lastSleep.endTime ?? lastSleep.startTime, sleepAsOf)
            : "None yet"
        }
        valueColor={sleepTone.text}
        sub={
          lastSleep
            ? [
                formatTime(lastSleep.endTime ?? lastSleep.startTime),
                lastSleep.durationMinutes
                  ? formatDuration(lastSleep.durationMinutes)
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : "Tap to see naps"
        }
        accessibilityLabel={
          lastSleep
            ? `Last sleep ended ${formatRelativeTime(
                lastSleep.endTime ?? lastSleep.startTime,
                sleepAsOf
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
                diaperMeta
                  ? `${diaperMeta.emoji} ${
                      SNAPSHOT_DIAPER_LABEL[lastDiaper.diaperStatus ?? ""] ??
                      diaperMeta.label
                    }`
                  : null,
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

      {/* ---------------------------------------------------------- pump */}
      <SnapshotCard
        pending={pending}
        emoji={pumpTone.emoji}
        label="Last pump"
        value={
          lastPump ? formatRelativeTime(lastPump.startTime, pumpAsOf) : "None yet"
        }
        valueColor={pumpTone.text}
        sub={
          lastPump
            ? [formatTime(lastPump.startTime), lastPumpDetail]
                .filter(Boolean)
                .join(" · ")
            : "Tap to see pumps"
        }
        accessibilityLabel={
          lastPump
            ? `Last pump ${formatRelativeTime(lastPump.startTime, pumpAsOf)}${
                lastPumpDetail ? `, ${lastPumpDetail}` : ""
              }. Opens the pump log.`
            : "No pumps yet. Opens the pump log."
        }
        onPress={() => onOpenLog("pump")}
      />
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
  footer,
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
  /** A second line under `sub`, for a card with a fact beyond "the last one
   *  was…" to show — currently just the diaper card's stock count. */
  footer?: React.ReactNode;
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

      {sub ? (
        <Text variant="caption" tone="subtle" tabular numberOfLines={1}>
          {sub}
        </Text>
      ) : null}

      {footer}
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
});
