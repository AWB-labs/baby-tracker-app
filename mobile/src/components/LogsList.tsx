import React, { useCallback, useMemo, useState } from "react";
import {
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
  ACTIVITY_LABEL,
  DIAPER_META,
  CONDITION_META,
  MEASURE_EMOJI,
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
}

export function LogRow({ log, gapMinutes, onEdit }: LogRowProps) {
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
  const showGap = gapMinutes != null && log.type === "feed";

  return (
    <View style={[styles.row, { backgroundColor: t.surface }]}>
      {/* The website's round emoji chip, tinted per activity. */}
      <View style={[styles.iconCircle, { backgroundColor: tone.soft }]}>
        <Emoji size={20}>{tone.emoji}</Emoji>
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant="bodyStrong" numberOfLines={1} style={styles.title}>
            {label}
            {log.side ? (
              <Text variant="subhead" style={{ color: tone.text }}>
                {"  "}({log.side === "left" ? "L" : "R"})
              </Text>
            ) : null}
          </Text>
          {!instant && log.durationMinutes != null && log.durationMinutes > 0 && (
            <Pill bg={tone.soft} fg={tone.text}>
              {formatDuration(log.durationMinutes)}
            </Pill>
          )}
        </View>

        <View style={styles.timeRow}>
          <Text variant="footnote" tone="subtle" tabular>
            {formatTime(log.startTime)}
            {!instant && log.endTime ? `  →  ${formatTime(log.endTime)}` : ""}
          </Text>
          {crossesDays > 0 && (
            <Pill bg={t.infoSoft} fg={t.info}>
              {crossesDays === 1
                ? `next day · ${shortDate(log.endTime!)}`
                : `+${crossesDays}d · ${shortDate(log.endTime!)}`}
            </Pill>
          )}
        </View>

        {(showGap ||
          log.amountMl != null ||
          diaperMeta ||
          log.weightKg != null ||
          log.heightCm != null ||
          conditionMeta ||
          log.feverCelsius != null) && (
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
            {/* A health row's own tone IS the rose health pair. */}
            {conditionMeta && (
              <Pill emoji={conditionMeta.emoji} bg={tone.soft} fg={tone.text}>
                {conditionMeta.label}
              </Pill>
            )}
            {log.feverCelsius != null && (
              <Pill emoji={MEASURE_EMOJI.fever} bg={t.warningSoft} fg={t.warning}>
                {units.formatTemperature(log.feverCelsius)}
              </Pill>
            )}
          </View>
        )}

        {log.type === "health" && (log.medication || log.dose) ? (
          <Text variant="footnote" tone="muted">
            {log.medication}
            {log.medication && log.dose ? " · " : ""}
            {log.dose ? `Dose: ${log.dose}` : ""}
          </Text>
        ) : null}

        <PauseTimelineIndicator pauseTimelineJson={log.pauseTimelineJson} />

        {log.comments ? (
          <Text variant="footnote" tone="muted" style={styles.comment}>
            “{log.comments}”
          </Text>
        ) : null}

        <View style={styles.footerRow}>
          <Text variant="caption" tone="subtle">
            by {log.enteredByName}
          </Text>
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
      </View>
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
   * Filter applied from outside — a snapshot card deep-linking into the Log
   * pre-filtered to its activity. Later changes re-apply; the user can still
   * switch chips freely afterwards.
   */
  initialFilter?: string | null;
  /** The screen's header, scrolled with the rows rather than pinned above them. */
  header?: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}

/** One row's worth of derived display state, computed once per list rather than
 *  per render — see `items` below. */
interface PreparedRow {
  log: LogEntry;
  dateLabel: string;
  /** First entry of its calendar day, so it carries the date header. */
  showHeader: boolean;
  gapMinutes: number | null;
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
  initialFilter = null,
  header,
  refreshing,
  onRefresh,
}: Props) {
  const t = useTheme();
  const [filter, setFilter] = useState<string | null>(initialFilter);

  // Re-apply when a new deep link arrives while the tab is already mounted.
  React.useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);
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

  const items = useMemo<PreparedRow[]>(() => {
    const source = filter ? logs.filter((l) => l.type === filter) : logs;
    let lastDate = "";
    return source.map((log) => {
      const dateLabel = formatDateLabel(log.startTime);
      const showHeader = dateLabel !== lastDate;
      lastDate = dateLabel;
      return { log, dateLabel, showHeader, gapMinutes: gaps.get(log.id) ?? null };
    });
  }, [logs, filter, gaps]);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<PreparedRow>) => {
      const { log, dateLabel, showHeader, gapMinutes } = item;

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
            <Text
              variant="overline"
              tone="subtle"
              style={styles.dateHeader}
              accessibilityRole="header"
            >
              {dateLabel}
            </Text>
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
      {logs.length > 0 && (
        <ChipRow>
          {FILTERS.map((value) => (
            <Chip
              key={value ?? "all"}
              label={value ? ACTIVITY_LABEL[value] : "All"}
              emoji={value ? FILTER_EMOJI[value] : undefined}
              selected={filter === value}
              onPress={() => setFilter(value)}
            />
          ))}
        </ChipRow>
      )}
    </View>
  );

  const listEmpty = loading ? (
    <SkeletonList rows={5} />
  ) : logs.length === 0 ? (
    <EmptyState
      icon="history"
      title="Nothing logged yet"
      body="Once a feed, nap or diaper is logged on Today it lands here, newest first."
    />
  ) : (
    <View style={styles.noMatches}>
      <Text variant="subhead" tone="subtle" center>
        Nothing here for that filter yet.
      </Text>
    </View>
  );

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
    letterSpacing: 1.4,
  },
  noMatches: { paddingVertical: space.xxl },
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
