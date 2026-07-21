import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
import { Text, Emoji, Chip, ChipRow, FadeInUp, ConfirmDialog } from "./ui";
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
  onDelete?: (id: number) => void;
  onEdit?: () => void | Promise<void>;
}

export default function LogsList({ logs, onDelete, onEdit }: Props) {
  const [filter, setFilter] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LogEntry | null>(null);
  const [editLog, setEditLog] = useState<LogEntry | null>(null);

  const gaps = useMemo(() => computeGaps(logs), [logs]);
  const filtered = filter ? logs.filter((l) => l.type === filter) : logs;

  if (logs.length === 0) return null;

  let lastDate = "";

  return (
    <View style={styles.list}>
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

      {filtered.length === 0 ? (
        <View style={styles.noMatches}>
          <Text variant="subhead" tone="subtle" center>
            Nothing here for that filter yet.
          </Text>
        </View>
      ) : (
        filtered.map((log, index) => {
          const dateLabel = formatDateLabel(log.startTime);
          const showHeader = dateLabel !== lastDate;
          lastDate = dateLabel;

          const row = (
            <LogRow
              log={log}
              gapMinutes={gaps.get(log.id)}
              onEdit={onEdit ? setEditLog : undefined}
            />
          );

          return (
            <FadeInUp key={log.id} index={index}>
              {showHeader && (
                <Text
                  variant="overline"
                  tone="accent"
                  center
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
            </FadeInUp>
          );
        })
      )}

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
  list: { gap: space.sm },
  dateHeader: { paddingTop: space.md, paddingBottom: space.xs },
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
