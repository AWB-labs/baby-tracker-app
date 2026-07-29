import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import type { LogEntry } from "../api/logs";
import { formatTime, formatDateLabel } from "../utils/formatTime";
import { formatDuration, formatGapLabel } from "../utils/formatDuration";
import { dayOffset, shortDate } from "../lib/dayMath";
import { isInstantLog } from "../lib/activities";
import { useTheme } from "../design/ThemeProvider";
import { Icon } from "../design/icons";
import {
  useActivityTone,
  ACTIVITY_LABEL,
  DIAPER_META,
  CONDITION_META,
  MEASURE_EMOJI,
} from "../design/activity";
import { space, radius, tabBar } from "../design/tokens";
import { useUnits } from "../context/SettingsContext";
import { Text, Emoji, Chip, ChipRow, ConfirmDialog } from "./ui";
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
  /** A tap-to-delete that never depends on the swipe landing. */
  onDelete?: (log: LogEntry) => void;
}

export function LogRow({ log, gapMinutes, onEdit, onDelete }: LogRowProps) {
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
          <View style={styles.footerActions}>
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
            {onDelete && (
              <Pressable
                onPress={() => onDelete(log)}
                accessibilityRole="button"
                accessibilityLabel={`Delete this ${label.toLowerCase()} entry`}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                style={({ pressed }) => [
                  styles.editBtn,
                  {
                    backgroundColor: t.dangerSoft,
                    borderColor: t.dangerBorder,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Icon name="trash" size="sm" color={t.danger} />
              </Pressable>
            )}
          </View>
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
  onDelete?: (id: number) => void;
  onEdit?: () => void | Promise<void>;
  /**
   * Filter applied from outside — a snapshot card deep-linking into the Log
   * pre-filtered to its activity. Later changes re-apply; the user can still
   * switch chips freely afterwards.
   */
  initialFilter?: string | null;
  /** Pull-to-refresh, owned here because the FlatList owns the scrolling. */
  refreshing?: boolean;
  onRefresh?: () => void;
}

/** One list item, with its date header precomputed so rows never depend on
 *  their neighbours at render time — a FlatList renders rows independently. */
interface ListItem {
  log: LogEntry;
  header: string | null;
}

export default function LogsList({
  logs,
  onDelete,
  onEdit,
  initialFilter = null,
  refreshing = false,
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

  const gaps = useMemo(() => computeGaps(logs), [logs]);

  // Precompute rows + their date headers once per change, not per render.
  const items = useMemo<ListItem[]>(() => {
    const source = filter ? logs.filter((l) => l.type === filter) : logs;
    let lastDate = "";
    return source.map((log) => {
      const dateLabel = formatDateLabel(log.startTime);
      const header = dateLabel !== lastDate ? dateLabel : null;
      lastDate = dateLabel;
      return { log, header };
    });
  }, [logs, filter]);

  const askDelete = useCallback((log: LogEntry) => setPendingDelete(log), []);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      const row = (
        <LogRow
          log={item.log}
          gapMinutes={gaps.get(item.log.id)}
          onEdit={onEdit ? setEditLog : undefined}
          onDelete={onDelete ? askDelete : undefined}
        />
      );
      return (
        <View style={styles.itemWrap}>
          {item.header && (
            <Text
              variant="overline"
              tone="subtle"
              style={styles.dateHeader}
              accessibilityRole="header"
            >
              {item.header}
            </Text>
          )}
          {onDelete ? (
            <SwipeableRow onDelete={() => askDelete(item.log)}>
              {row}
            </SwipeableRow>
          ) : (
            row
          )}
        </View>
      );
    },
    [gaps, onEdit, onDelete, askDelete]
  );

  if (logs.length === 0) return null;

  return (
    <View style={styles.list}>
      {/*
       * Virtualized: real families carry hundreds of entries, and mounting
       * every row at once was what made this tab slow to open and quick to
       * die under memory pressure. The FlatList mounts a screenful and
       * recycles the rest.
       */}
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.log.id)}
        renderItem={renderItem}
        ListHeaderComponent={
          <ChipRow style={styles.chips}>
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
        }
        ListEmptyComponent={
          <View style={styles.noMatches}>
            <Text variant="subhead" tone="subtle" center>
              Nothing here for that filter yet.
            </Text>
          </View>
        }
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={t.accent}
              colors={[t.accent]}
              progressBackgroundColor={t.surface}
            />
          ) : undefined
        }
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={styles.listContent}
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
    </View>
  );
}

const styles = StyleSheet.create({
  // flex:1 so the FlatList gets a bounded viewport to virtualize within —
  // inside an unbounded container it would render everything anyway.
  list: { flex: 1 },
  listContent: {
    gap: space.sm,
    paddingBottom: tabBar.margin + tabBar.height + space.lg,
  },
  itemWrap: { gap: space.xxs },
  chips: { paddingBottom: space.xs },
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
  footerActions: { flexDirection: "row", gap: space.sm },
  editBtn: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
