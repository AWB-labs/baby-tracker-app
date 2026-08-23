import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../design/ThemeProvider";
import { useActivityTone, DIAPER_META } from "../design/activity";
import { space } from "../design/tokens";
import { Icon } from "../design/icons";
import { Card, PressableCard, Text, Emoji } from "./ui";
import { formatTime, formatRelativeTime } from "../utils/formatTime";
import { formatDuration } from "../utils/formatDuration";
import { summarise } from "../lib/greeting";
import { useUnits } from "../context/SettingsContext";
import type { LogEntry, MilkBalance } from "../api/logs";

interface Props {
  logs: LogEntry[];
  /** True while the first fetch for this baby is still in flight. */
  loading?: boolean;
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
  /** Nappies on hand — see useDiaperStock. Null while loading or unknown,
   *  in which case the diaper card simply shows no stock line. */
  diaperStock?: number | null;
  /** Open the stock sheet. Without it the stock line stays a plain caption. */
  onOpenDiaperStock?: () => void;
}

/**
 * At or below this, the count stops being a footnote on the diaper card and
 * takes a card of its own.
 *
 * Six is about a day for a newborn and rather more for an older baby, which
 * is the right side to err on: the cost of promoting it early is one card,
 * and the cost of promoting it late is a 3am trip to the shop.
 */
const LOW_STOCK_AT = 6;

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
 * feed, sleep and diaper open the Log filtered to that activity, and the
 * day-so-far card opens Insights. Feed and sleep always read "last one was…",
 * never a live running clock — that clock already lives, bigger and with its
 * own controls, in the Track row below; duplicating it up here just to save a
 * glance conflicted with the row's own centred timer instead of matching it.
 */
export default function Snapshot({
  logs,
  loading = false,
  onOpenLog,
  onOpenInsights,
  milkBalance,
  onOpenMilkBalance,
  diaperStock,
  onOpenDiaperStock,
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
  const hasMilk =
    !!milkBalance && milkBalance.pumpedMl > 0 && !!onOpenMilkBalance;
  const availableMl = hasMilk ? Math.max(0, milkBalance!.balanceMl) : 0;

  // Not while the count is still unknown: "0 left" during the first fetch
  // would be a false alarm, and a loud one.
  const showLowStock =
    !pending &&
    diaperStock != null &&
    diaperStock <= LOW_STOCK_AT &&
    !!onOpenDiaperStock;

  /*
   * Diapers earn a line on the Stock card only while there is a pile to
   * report and the low-stock card isn't already shouting the same number a
   * few inches below. A family that has never restocked sits at zero, and a
   * permanent "0" would cost them the day-so-far card for nothing.
   */
  const showStockRow =
    diaperStock != null &&
    diaperStock > 0 &&
    !!onOpenDiaperStock &&
    !showLowStock;

  // With neither to show, the fourth slot goes back to the day summary.
  const showStock = hasMilk || showStockRow;

  return (
    <View style={styles.grid}>
      {/* ---------------------------------------------------------- feed */}
      <SnapshotCard
        pending={pending}
        emoji={feedTone.emoji}
        label="Last feed"
        value={lastFeed ? formatRelativeTime(lastFeed.startTime) : "None yet"}
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
        label="Last sleep"
        value={
          lastSleep
            ? // Counted from when it ended, not when it started — "how long
              // has the baby been awake" is the useful question, and for an
              // hours-long nap those are very different numbers.
              formatRelativeTime(lastSleep.endTime ?? lastSleep.startTime)
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
                lastSleep.endTime ?? lastSleep.startTime
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

      {/* --------------------------------------------------- today / stock */}
      {showStock ? (
        <StockCard
          pending={pending}
          milk={
            hasMilk
              ? {
                  value: units.formatVolume(availableMl),
                  onPress: onOpenMilkBalance!,
                }
              : null
          }
          stock={
            showStockRow
              ? { count: diaperStock!, onPress: onOpenDiaperStock! }
              : null
          }
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

      {/* ------------------------------------------------- running low
          A fifth card breaks the 2×2 grid, and that is the point: `flexGrow`
          stretches a lone card across the full width, so this reads as a
          banner rather than an orphan. It earns that room only while the
          number is low — a count that is always prominent stops being
          noticed, which is how it ended up as a caption in the first place. */}
      {showLowStock ? (
        <SnapshotCard
          emoji={diaperStock === 0 ? "🚨" : diaperTone.emoji}
          label="Diaper stock"
          value={
            diaperStock === 0
              ? "You're out"
              : `${diaperStock} left`
          }
          valueColor={diaperStock === 0 ? t.danger : t.warning}
          sub={
            diaperStock === 0
              ? "Tap to add a pack"
              : "Running low — tap to restock"
          }
          accessibilityLabel={
            diaperStock === 0
              ? "Out of diapers. Opens the stock sheet to restock."
              : `Only ${diaperStock} diapers left. Opens the stock sheet to restock.`
          }
          onPress={onOpenDiaperStock!}
        />
      ) : null}
    </View>
  );
}

/**
 * Two running totals in the fourth slot: pumped milk, and nappies on hand.
 *
 * Not a `SnapshotCard`, because those are doors — one card, one destination,
 * one chevron. This holds two independent controls, so each half owns its own
 * tap and the card itself is inert. A single chevron here would promise a
 * place the card doesn't go.
 *
 * Side by side rather than stacked, and that is the whole reason for the
 * shape: two full-height columns split the card down the middle, so each
 * target is about as tall as the card and impossible to confuse for the
 * other. Stacked rows put two ~20pt strips a few points apart, which is
 * exactly the arrangement a thumb gets wrong.
 *
 * Either half can be absent (no pump history, or an empty pile), in which
 * case the other takes the full width and the divider goes with it.
 */
function StockCard({
  milk,
  stock,
  pending = false,
}: {
  milk: { value: string; onPress: () => void } | null;
  stock: { count: number; onPress: () => void } | null;
  pending?: boolean;
}) {
  const t = useTheme();
  // The same glyph the diaper card and Track row use, from one definition.
  const diaperEmoji = useActivityTone("diaper").emoji;

  return (
    <Card style={styles.card}>
      <View style={styles.labelRow}>
        <Emoji size={14}>🧺</Emoji>
        <Text variant="caption" tone="muted" numberOfLines={1} style={styles.flex}>
          Stock
        </Text>
        {/* The affordance for both halves at once — a pencil in each column
            would cost the width the numbers need. */}
        <Icon name="edit" size="xs" color={t.textSubtle} />
      </View>

      <View style={styles.stockRow}>
        {milk ? (
          <StockStat
            emoji="🍼"
            value={pending ? "—" : milk.value}
            color={t.accentText}
            accessibilityLabel={`${milk.value} of pumped milk available. Opens the milk supply sheet to correct it.`}
            onPress={milk.onPress}
          />
        ) : null}

        {milk && stock ? (
          <View style={[styles.stockDivider, { backgroundColor: t.border }]} />
        ) : null}

        {stock ? (
          <StockStat
            emoji={diaperEmoji}
            value={pending ? "—" : String(stock.count)}
            color={t.text}
            accessibilityLabel={`${stock.count} diapers in stock. Opens the diaper stock sheet.`}
            onPress={stock.onPress}
          />
        ) : null}
      </View>
    </Card>
  );
}

/** One tappable total, filling its half of the card top to bottom. */
function StockStat({
  emoji,
  value,
  color,
  accessibilityLabel,
  onPress,
}: {
  emoji: string;
  value: string;
  color: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.stockStat,
        { opacity: pressed ? 0.5 : 1 },
      ]}
    >
      <Emoji size={15}>{emoji}</Emoji>
      <Text
        variant="subheadStrong"
        tabular
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={{ color }}
      >
        {value}
      </Text>
    </Pressable>
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
  flex: { flex: 1 },
  // The two halves, and the hairline that makes the split visible rather
  // than merely implied by where the taps happen to land.
  stockRow: { flexDirection: "row", alignItems: "stretch", flex: 1 },
  stockStat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xxs,
    // Vertical padding, not height: the row stretches to whatever the card
    // gives it, and the taller the target the harder it is to mis-hit.
    paddingVertical: space.xs,
  },
  stockDivider: { width: StyleSheet.hairlineWidth, marginVertical: space.xxs },
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
