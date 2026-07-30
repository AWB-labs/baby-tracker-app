import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from "react-native";
import type { LogEntry } from "../api/logs";
import { formatTime, formatDateLabel } from "../utils/formatTime";
import { formatDuration, formatGapLabel } from "../utils/formatDuration";
import { dayOffset, shortDate } from "../lib/dayMath";
import { isInstantLog } from "../lib/activities";
import { useTheme } from "../design/ThemeProvider";
import {
  useActivityTone,
  useActivityTones,
  ACTIVITY_LABEL,
  DIAPER_META,
  CONDITION_META,
  SLEEP_KIND_META,
  MEASURE_EMOJI,
  type ActivityTone,
} from "../design/activity";
import { space, radius } from "../design/tokens";
import { useUnits } from "../context/SettingsContext";
import {
  Text,
  Emoji,
  Chip,
  ChipRow,
  FadeInUp,
  ConfirmDialog,
  EmptyState,
  SkeletonList,
  screenContentPadding,
} from "./ui";
import SwipeableRow from "./SwipeableRow";
import PauseTimelineIndicator from "./PauseTimelineIndicator";
import EditLogModal from "./EditLogModal";

const FILTERS: (string | null)[] = [
  null,
  "feed",
  "pump",
  "sleep",
  "diaper",
  "shower",
  "vitamin",
  "nailcut",
  "growth",
  "health",
];

const FILTER_EMOJI: Record<string, string> = {
  feed: "🤱",
  pump: "🍼",
  sleep: "😴",
  diaper: "🩲",
  shower: "🚿",
  vitamin: "💊",
  nailcut: "💅",
  growth: "📏",
  health: "🩺",
};

function computeGaps(logs: LogEntry[]): Map<number, number | null> {
  const gaps = new Map<number, number | null>();
  const lastByType = new Map<string, Date>();
  const sorted = [...logs].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
  for (const log of sorted) {
    const prev = lastByType.get(log.type);
    gaps.set(
      log.id,
      prev ? (new Date(log.startTime).getTime() - prev.getTime()) / 60000 : null
    );
    lastByType.set(log.type, new Date(log.startTime));
  }
  return gaps;
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

/* -------------------------------------------------------------------------- */
/* LogRow — one entry, matching the website's log card                         */
/* -------------------------------------------------------------------------- */

export interface LogRowProps {
  log: LogEntry;
  /** Minutes since the previous log of the same type, when worth showing. */
  gapMinutes?: number | null;
  onEdit?: (log: LogEntry) => void;
  /**
   * The Medical tab's whole list is health entries, so "Health" repeated as
   * every row's title said nothing the screen itself hadn't already said.
   * With this on, a health row leads with its condition instead, and a
   * fever's actual number and the medicine given get more visual weight than
   * a same-size pill or a muted footnote — the things worth reading at a
   * glance in a list that's nothing but health entries.
   */
  emphasizeHealth?: boolean;
}

/**
 * "Today" / "Yesterday" / "Wed, Jul 30" above a run of entries for that day.
 *
 * Exported so every screen grouping logs by day — Activity, Medical — renders
 * this the same way. Health used to have its own copy, centered and in the
 * accent colour; the two read as different components even though they meant
 * the same thing, purely because nobody had one place to change. `children`
 * is where Activity slots in that day's totals — Health has none to show and
 * simply omits it.
 */
export function DateHeader({
  label,
  children,
}: {
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.dateHeader}>
      <Text variant="overline" tone="subtle" accessibilityRole="header">
        {label}
      </Text>
      {children}
    </View>
  );
}

export function LogRow({ log, gapMinutes, onEdit, emphasizeHealth }: LogRowProps) {
  const t = useTheme();
  const tone = useActivityTone(log.type);
  const units = useUnits();

  const label = ACTIVITY_LABEL[log.type] ?? log.type;
  const instant = isInstantLog(log.type, {
    side: log.side,
    amountMl: log.amountMl,
  });
  const crossesDays =
    !instant && log.endTime ? dayOffset(log.startTime, log.endTime) : 0;
  const diaperMeta =
    log.type === "diaper" && log.diaperStatus
      ? DIAPER_META[log.diaperStatus]
      : null;
  const conditionMeta =
    log.type === "health" && log.healthCondition
      ? CONDITION_META[log.healthCondition]
      : null;
  // "Other" carries what it actually is in `comments`, so the pill shows that
  // instead of the word "Other" — an entry that says "Ear infection" is worth
  // more at a glance than one that says nothing was fever, cold or stomach.
  // Older entries with no description keep "Other" as the fallback.
  const isOtherCondition = log.type === "health" && log.healthCondition === "other";
  const conditionLabel =
    isOtherCondition && log.comments ? log.comments : conditionMeta?.label;
  const showGap = gapMinutes != null && log.type === "feed";

  const healthEmphasis = !!emphasizeHealth && log.type === "health";
  const title = healthEmphasis ? conditionLabel ?? label : label;

  return (
    <View style={[styles.row, { backgroundColor: t.surface }]}>
      {/* The website's round emoji chip, tinted per activity. */}
      <View style={[styles.iconCircle, { backgroundColor: tone.soft }]}>
        <Emoji size={20}>{tone.emoji}</Emoji>
      </View>

      <View style={styles.body}>
        {/* Name on the left, time hard right — but only when the time is
            short enough not to fight it for room. A start→end range like
            "8:39 AM → 12:00 PM" plus a duration pill is wide enough on its own
            to squeeze "Feed" down to "F…"; sharing that time onto its own row
            costs one line, but a truncated name isn't a name. An instant log's
            single timestamp is short and safe to keep beside the title. */}
        <View style={styles.titleRow}>
          <Text variant="bodyStrong" numberOfLines={1} style={styles.title}>
            {title}
            {log.side ? (
              <Text variant="subhead" style={{ color: tone.text }}>
                {"  "}({log.side === "left" ? "L" : "R"})
              </Text>
            ) : log.sleepKind === "nap" || log.sleepKind === "night" ? (
              <Text variant="subhead" style={{ color: tone.text }}>
                {"  "}({SLEEP_KIND_META[log.sleepKind].emoji}{" "}
                {SLEEP_KIND_META[log.sleepKind].label})
              </Text>
            ) : null}
          </Text>
          {instant && (
            <Text variant="footnote" tone="subtle" tabular numberOfLines={1}>
              {formatTime(log.startTime)}
            </Text>
          )}
        </View>

        {/* A fever's actual number is the thing worth reading at a glance
            here — bigger and bolder than the same-size pill it'd otherwise
            share the row with, next to a "Fever" pill the title already
            said. */}
        {healthEmphasis && log.feverCelsius != null && (
          <Text variant="title3" tabular style={{ color: t.warning }}>
            {units.formatTemperature(log.feverCelsius)}
          </Text>
        )}

        {!instant && (
          <View style={styles.timeRow}>
            <Text variant="footnote" tone="subtle" tabular>
              {formatTime(log.startTime)}
              {log.endTime ? ` → ${formatTime(log.endTime)}` : ""}
            </Text>
            {log.durationMinutes != null && log.durationMinutes > 0 && (
              <Pill bg={tone.soft} fg={tone.text}>
                {formatDuration(log.durationMinutes)}
              </Pill>
            )}
          </View>
        )}

        {crossesDays > 0 && (
          <View style={styles.timeRow}>
            <Pill bg={t.infoSoft} fg={t.info}>
              {crossesDays === 1
                ? `next day · ${shortDate(log.endTime!)}`
                : `+${crossesDays}d · ${shortDate(log.endTime!)}`}
            </Pill>
          </View>
        )}

        {(showGap ||
          log.amountMl != null ||
          diaperMeta ||
          log.weightKg != null ||
          log.heightCm != null ||
          (conditionMeta && !healthEmphasis) ||
          (log.feverCelsius != null && !healthEmphasis) ||
          log.medication ||
          log.dose) && (
          <View style={styles.badges}>
            {showGap && (
              <Pill emoji="⏱" bg={t.infoSoft} fg={t.info}>
                {formatGapLabel(gapMinutes!)} since previous feed
              </Pill>
            )}
            {log.amountMl != null && (
              <Pill emoji={MEASURE_EMOJI.volume} bg={t.infoSoft} fg={t.info}>
                {units.formatVolume(log.amountMl)}
              </Pill>
            )}
            {diaperMeta && (
              <Pill emoji={diaperMeta.emoji} bg={t.warningSoft} fg={t.warning}>
                {diaperMeta.label}
              </Pill>
            )}
            {log.weightKg != null && (
              <Pill emoji={MEASURE_EMOJI.weight} bg={t.infoSoft} fg={t.info}>
                {units.formatWeight(log.weightKg)}
              </Pill>
            )}
            {log.heightCm != null && (
              <Pill emoji={MEASURE_EMOJI.height} bg={t.successSoft} fg={t.success}>
                {units.formatHeight(log.heightCm)}
              </Pill>
            )}
            {/* A health row's own tone IS the rose health pair. Suppressed
                under emphasis — the title already says the condition, so the
                pill would just repeat it. */}
            {conditionMeta && !healthEmphasis && (
              <Pill emoji={conditionMeta.emoji} bg={tone.soft} fg={tone.text}>
                {conditionLabel}
              </Pill>
            )}
            {/* Same reasoning — the number has its own bigger line above
                under emphasis, so it doesn't also need the small pill. */}
            {log.feverCelsius != null && !healthEmphasis && (
              <Pill emoji={MEASURE_EMOJI.fever} bg={t.warningSoft} fg={t.warning}>
                {units.formatTemperature(log.feverCelsius)}
              </Pill>
            )}
            {/* Alongside the condition and temperature, not a footnote below
                them — what was given is as much "what happened" as the
                fever itself. */}
            {(log.medication || log.dose) && (
              <Pill emoji="💊" bg={tone.soft} fg={tone.text}>
                {log.medication}
                {log.medication && log.dose ? " · " : ""}
                {log.dose ? `Dose: ${log.dose}` : ""}
              </Pill>
            )}
          </View>
        )}

        <PauseTimelineIndicator pauseTimelineJson={log.pauseTimelineJson} />

        {/* Suppressed when it's already the condition pill's own text above —
            otherwise "Ear infection" would print twice on the same row. */}
        {log.comments && !(isOtherCondition && conditionLabel === log.comments) ? (
          <Text variant="footnote" tone="muted" style={styles.comment}>
            “{log.comments}”
          </Text>
        ) : null}

        {/* Authorship is the least of it, so it gets the least: one caption,
            no row of its own alongside a button. */}
        <Text variant="caption" tone="subtle">
          by {log.enteredByName}
        </Text>
      </View>

      {onEdit && (
        <Pressable
          onPress={() => onEdit(log)}
          accessibilityRole="button"
          accessibilityLabel={`Edit this ${label.toLowerCase()} entry`}
          // The pill is only ~26pt tall, so the shared 8pt slop (sized for
          // the 36pt controls elsewhere) leaves it short of the 44pt floor.
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          style={({ pressed }) => [
            styles.editBtn,
            {
              backgroundColor: t.accentSofter,
              borderColor: t.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Emoji size={13}>✏️</Emoji>
        </Pressable>
      )}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* LogsList                                                                    */
/* -------------------------------------------------------------------------- */

interface Props {
  logs: LogEntry[];
  /** True while the first fetch for this baby is still in flight. */
  loading?: boolean;
  onDelete?: (id: number) => void;
  onEdit?: () => void | Promise<void>;
  /**
   * The active activity filter, owned by the screen.
   *
   * Controlled rather than internal because it decides what gets *fetched* now,
   * not just what gets shown: the list is paged, so filtering has to happen in
   * the query or a chip would search only the rows already downloaded.
   */
  filter?: string | null;
  onFilterChange?: (filter: string | null) => void;
  /** The screen's header, scrolled with the rows rather than pinned above them. */
  header?: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Fetch the next page — wired to the list reaching its end. */
  onEndReached?: () => void;
  loadingMore?: boolean;
  /**
   * Whether more pages exist. Used to suppress the totals on the last day
   * shown, which is the one page boundaries cut in half.
   */
  hasMore?: boolean;
}

/** What a day added up to, for the summary beside its date header. */
interface DayTotals {
  sleepMinutes: number;
  feedCount: number;
  feedMinutes: number;
  bottleMl: number;
  pumpMl: number;
  diaperCount: number;
  /**
   * Everything else, kept apart by type rather than lumped into one count —
   * shower, vitamin, nail cut, growth, health, and every habit. Nap and night
   * both land under sleepMinutes above, since they're the same server type
   * and already share sleep's icon.
   */
  otherByType: Record<string, number>;
}

/** One row's worth of derived display state, computed once per list rather than
 *  per render — see `items` below. */
interface PreparedRow {
  log: LogEntry;
  dateLabel: string;
  /** First entry of its calendar day, so it carries the date header. */
  showHeader: boolean;
  /** Set only on the row that carries the header, and only when the day is
   *  whole — see `items`. */
  totals: DayTotals | null;
  gapMinutes: number | null;
}

/**
 * A day's entries, added up.
 *
 * Every log is credited to the day it *started*, which is the day it appears
 * under. An overnight sleep therefore counts entirely towards the evening it
 * began rather than being split across midnight — splitting reads better in a
 * chart, but this is a list of entries and a total that disagrees with the rows
 * beneath it is worse than one that's simply defined.
 */
function totalsFor(logs: LogEntry[]): DayTotals {
  const totals: DayTotals = {
    sleepMinutes: 0,
    feedCount: 0,
    feedMinutes: 0,
    bottleMl: 0,
    pumpMl: 0,
    diaperCount: 0,
    otherByType: {},
  };
  for (const log of logs) {
    const mins = log.durationMinutes ?? 0;
    switch (log.type) {
      case "sleep":
        totals.sleepMinutes += mins;
        break;
      case "feed":
        totals.feedCount += 1;
        totals.feedMinutes += mins;
        totals.bottleMl += log.amountMl ?? 0;
        break;
      case "pump":
        totals.pumpMl += log.amountMl ?? 0;
        break;
      case "diaper":
        totals.diaperCount += 1;
        break;
      default:
        totals.otherByType[log.type] = (totals.otherByType[log.type] ?? 0) + 1;
    }
  }
  return totals;
}

/**
 * A day's tallies, beside its date.
 *
 * Only what actually happened: a day with no pumping says nothing about
 * pumping, rather than carrying a row of zeroes for every activity the app
 * supports. It reads as a sentence about the day instead of a form.
 */
/**
 * Which server type each "everything else" entry belongs to, in a fixed
 * reading order rather than whatever order they happened to occur in — the
 * fallback (alphabetical, appended after) only ever fires for a type this
 * list hasn't been told about yet.
 */
const OTHER_TYPE_ORDER = [
  "shower", "vitamin", "nailcut", "growth", "health",
  "tummy", "sunlight", "bath", "massage", "teeth", "walk", "medicine",
];

function DayTotalsRow({ totals }: { totals: DayTotals }) {
  const t = useTheme();
  const units = useUnits();
  const tones = useActivityTones();

  const parts: { key: string; emoji: string; text: string; color: string }[] = [];
  if (totals.sleepMinutes > 0) {
    parts.push({
      key: "sleep",
      emoji: tones.sleep.emoji,
      text: formatDuration(totals.sleepMinutes),
      color: tones.sleep.text,
    });
  }
  if (totals.feedCount > 0) {
    // Feeds are counted, with the timed or measured total after it when there
    // is one — "6 · 1h 20m" says more than either number alone.
    const detail =
      totals.feedMinutes > 0
        ? formatDuration(totals.feedMinutes)
        : totals.bottleMl > 0
          ? units.formatVolume(totals.bottleMl)
          : null;
    parts.push({
      key: "feed",
      emoji: tones.feed.emoji,
      text: detail ? `${totals.feedCount} · ${detail}` : `${totals.feedCount}`,
      color: tones.feed.text,
    });
  }
  if (totals.pumpMl > 0) {
    parts.push({
      key: "pump",
      emoji: tones.pump.emoji,
      text: units.formatVolume(totals.pumpMl),
      color: tones.pump.text,
    });
  }
  if (totals.diaperCount > 0) {
    parts.push({
      key: "diaper",
      emoji: tones.diaper.emoji,
      text: `${totals.diaperCount}`,
      color: tones.diaper.text,
    });
  }
  // The fixed order first, then anything the list doesn't yet know about,
  // alphabetically — so a new server type shows up rather than vanishing.
  const otherTypes = [
    ...OTHER_TYPE_ORDER.filter((k) => (totals.otherByType[k] ?? 0) > 0),
    ...Object.keys(totals.otherByType)
      .filter((k) => !OTHER_TYPE_ORDER.includes(k))
      .sort(),
  ];
  for (const type of otherTypes) {
    const tone = (tones as Record<string, ActivityTone | undefined>)[type];
    parts.push({
      key: type,
      // Custom habits all share one server type ("habit") with no icon of
      // their own — the emoji lives in the per-baby habit config, not on the
      // log row this component has — so a star stands in for "something".
      emoji: tone?.emoji ?? "⭐",
      text: `${totals.otherByType[type]}`,
      color: tone?.text ?? t.textSubtle,
    });
  }

  if (parts.length === 0) return null;

  return (
    <View
      style={styles.totalsRow}
      accessible
      accessibilityLabel={`Day total: ${parts
        .map((p) => `${p.key} ${p.text}`)
        .join(", ")}`}
    >
      {parts.map((part) => (
        <View key={part.key} style={styles.totalsItem}>
          <Emoji size={11}>{part.emoji}</Emoji>
          <Text variant="caption" tabular style={{ color: part.color }}>
            {part.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * How many rows get an entrance animation.
 *
 * The list is virtualized, so rows mount and unmount as they scroll past. Fading
 * every one of them in would re-run the animation each time a row came back into
 * the window, which reads as flicker rather than as arrival. Only the first
 * screenful animates — that's where the entrance is actually seen.
 */
const ANIMATED_ROWS = 8;

const keyExtractor = (item: PreparedRow) => String(item.log.id);

export default function LogsList({
  logs,
  loading = false,
  onDelete,
  onEdit,
  filter = null,
  onFilterChange,
  header,
  refreshing,
  onRefresh,
  onEndReached,
  loadingMore = false,
  hasMore = false,
}: Props) {
  const t = useTheme();
  const [pendingDelete, setPendingDelete] = useState<LogEntry | null>(null);
  const [editLog, setEditLog] = useState<LogEntry | null>(null);

  /**
   * Filtering, gap lookup and the date-header runs are resolved up front.
   *
   * The date header used to be decided by a `lastDate` variable carried across a
   * `.map`, which a virtualized list cannot reproduce: rows render individually
   * and out of order, so "is this a new day" has to be a property of the row,
   * not of the loop that drew it.
   */
  // Gaps are measured against the unfiltered history — the time since the last
  // feed doesn't change because the list is currently showing only nappies — so
  // this is keyed on `logs` alone and survives a chip tap.
  const gaps = useMemo(() => computeGaps(logs), [logs]);

  // No filtering here: the chips re-query the server now. Narrowing a page
  // that has already been fetched would show "nothing here" for any activity
  // whose most recent entry falls outside the rows loaded so far.
  const items = useMemo<PreparedRow[]>(() => {
    // Bucket by day first, so the header row can carry that day's totals.
    const byDay = new Map<string, LogEntry[]>();
    for (const log of logs) {
      const key = formatDateLabel(log.startTime);
      const bucket = byDay.get(key);
      if (bucket) bucket.push(log);
      else byDay.set(key, [log]);
    }

    /*
     * The last day on screen is the one a page boundary cuts through: more of
     * it may be waiting on the next fetch, so its total would be an
     * understatement presented as fact. It gets no summary until the rest of
     * the history has arrived, at which point the day is whole.
     */
    const dayKeys = [...byDay.keys()];
    const incompleteDay = hasMore ? dayKeys[dayKeys.length - 1] : null;

    let lastDate = "";
    return logs.map((log) => {
      const dateLabel = formatDateLabel(log.startTime);
      const showHeader = dateLabel !== lastDate;
      lastDate = dateLabel;
      return {
        log,
        dateLabel,
        showHeader,
        totals:
          showHeader && dateLabel !== incompleteDay
            ? totalsFor(byDay.get(dateLabel) ?? [])
            : null,
        gapMinutes: gaps.get(log.id) ?? null,
      };
    });
  }, [logs, gaps, hasMore]);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<PreparedRow>) => {
      const { log, dateLabel, showHeader, totals, gapMinutes } = item;

      const row = (
        <LogRow
          log={log}
          gapMinutes={gapMinutes}
          onEdit={onEdit ? setEditLog : undefined}
        />
      );

      const content = (
        <>
          {showHeader && (
            <DateHeader label={dateLabel}>
              {totals ? <DayTotalsRow totals={totals} /> : null}
            </DateHeader>
          )}
          {onDelete ? (
            <SwipeableRow onDelete={() => setPendingDelete(log)}>
              {row}
            </SwipeableRow>
          ) : (
            row
          )}
        </>
      );

      return index < ANIMATED_ROWS ? (
        <FadeInUp index={index}>{content}</FadeInUp>
      ) : (
        <View>{content}</View>
      );
    },
    [onDelete, onEdit]
  );

  const listHeader = (
    <View style={styles.header}>
      {header}
      {/* Shown whenever a filter is on, even with nothing to show: the chips
          are the only way back to "All", and hiding them on an empty result
          would strand you there. */}
      {(logs.length > 0 || filter) && (
        <ChipRow>
          {FILTERS.map((value) => (
            <Chip
              key={value ?? "all"}
              label={value ? ACTIVITY_LABEL[value] : "All"}
              emoji={value ? FILTER_EMOJI[value] : undefined}
              selected={filter === value}
              onPress={() => onFilterChange?.(value)}
            />
          ))}
        </ChipRow>
      )}
    </View>
  );

  // With the filter in the query, an empty result means the server has nothing
  // of that type — not that the loaded page happened to miss it.
  const listEmpty = loading ? (
    <SkeletonList rows={5} />
  ) : filter ? (
    <View style={styles.noMatches}>
      <Text variant="subhead" tone="subtle" center>
        No {(ACTIVITY_LABEL[filter] ?? filter).toLowerCase()} entries yet.
      </Text>
    </View>
  ) : (
    <EmptyState
      icon="history"
      title="Nothing logged yet"
      body="Once a feed, nap or diaper is logged on Today it lands here, newest first."
    />
  );

  /** A spinner only while a page is actually in flight. */
  const listFooter = loadingMore ? (
    <View style={styles.footerSpinner}>
      <ActivityIndicator color={t.accent} />
    </View>
  ) : null;

  return (
    <>
      {/*
        A FlatList, not a mapped ScrollView. Every row carries a gesture handler,
        an animated value and an SVG icon, so mounting a full history at once ran
        to tens of thousands of native views and took the app down. Windowing
        keeps roughly a screenful alive at a time regardless of how many entries
        the account has.
      */}
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        onEndReached={onEndReached}
        // Half a screen's warning. Firing at the very bottom means waiting for
        // a round trip with nothing left to read.
        onEndReachedThreshold={0.5}
        // The screen hands over its full height; without this the list sizes to
        // its content and spills past the bottom of the screen instead of
        // scrolling inside it.
        style={styles.fill}
        contentContainerStyle={[screenContentPadding(), styles.listContent]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              tintColor={t.accent}
              colors={[t.accent]}
              progressBackgroundColor={t.surface}
            />
          ) : undefined
        }
      />

      <ConfirmDialog
        visible={pendingDelete !== null}
        title="Delete this entry?"
        message={
          pendingDelete
            ? `The ${ACTIVITY_LABEL[pendingDelete.type]?.toLowerCase() ?? "entry"} at ${formatTime(
                pendingDelete.startTime
              )} will be removed for every caregiver.`
            : ""
        }
        onConfirm={() => {
          if (pendingDelete) onDelete?.(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />

      {editLog && (
        <EditLogModal
          key={editLog.id}
          log={editLog}
          onClose={() => setEditLog(null)}
          onSaved={() => onEdit?.()}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Matches the gap Screen's ScrollView gave the rows before they were windowed.
  listContent: { gap: space.sm },
  // The header block keeps the screen header and the filter chips a full step
  // apart, the spacing Screen's own content gap used to provide.
  header: { gap: space.lg },
  dateHeader: {
    paddingTop: space.xl,
    paddingBottom: space.xs,
    paddingLeft: space.xxs,
    gap: space.xs,
  },
  // Wraps rather than truncating: a busy day has more tallies than fit on one
  // line, and dropping the diapers off the end would be arbitrary.
  totalsRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  totalsItem: { flexDirection: "row", alignItems: "center", gap: space.xxs },
  noMatches: { paddingVertical: space.xxl },
  footerSpinner: { paddingVertical: space.lg },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    borderRadius: radius.lg,
    padding: space.md,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0, gap: space.xxs },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  title: { flex: 1 },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.sm,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
    marginTop: space.xxs,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  comment: { fontStyle: "italic" },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: space.xxs,
  },
  editBtn: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
