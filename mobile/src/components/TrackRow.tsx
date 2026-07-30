import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../design/ThemeProvider";
import {
  space,
  radius,
  hitSlop,
  PRESSED_OPACITY,
} from "../design/tokens";
import {
  useActivityTone,
  ACTIVITY_LABEL,
  DIAPER_META,
} from "../design/activity";
import { Text, Badge, Emoji } from "./ui/primitives";
import { Button, IconButton } from "./ui/Button";
import { Input, Field } from "./ui/Input";
import { Sheet } from "./ui/Sheet";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { useToast } from "./Toast";
import { useUnits } from "../context/SettingsContext";
import type { UseTimerResult } from "../hooks/useTimer";
import { createLog, type LogEntry } from "../api/logs";
import { formatTimer, formatRelativeTime, formatTime } from "../utils/formatTime";
import { formatDuration } from "../utils/formatDuration";

const DIAPER_OPTIONS = Object.entries(DIAPER_META).map(([value, meta]) => ({
  value,
  ...meta,
}));

interface Config {
  hasSides: boolean;
  hasAmount: boolean;
  amountLabel?: string;
}

const CONFIG: Record<string, Config> = {
  // Feed is breast (L/R timed) with a bottle shortcut: a bottle saves as a
  // `feed` with a volume and no side, exactly as the database has always stored
  // it — no separate type on the wire.
  feed: { hasSides: true, hasAmount: true, amountLabel: "Bottle" },
  // Pump is breast pumping — timed per side, like a feed.
  pump: { hasSides: true, hasAmount: false },
  sleep: { hasSides: false, hasAmount: false },
  diaper: { hasSides: false, hasAmount: false },
};

export type TrackType = "feed" | "pump" | "sleep" | "diaper";

/**
 * Nap or night.
 *
 * Two words that can't be recovered from timestamps later: eleven hours of
 * sleep is a very different night depending on whether it came in one stretch
 * or six naps, and only the person who was there knows which.
 */
const SLEEP_KINDS: { value: "nap" | "night"; label: string; emoji: string }[] = [
  { value: "nap", label: "Nap", emoji: "☀️" },
  { value: "night", label: "Night", emoji: "🌙" },
];

interface Props {
  type: TrackType;
  babyId: number;
  enteredByName: string;
  onLogSaved: () => void;
  /**
   * Owned by the screen, not the row, so the snapshot above can read the same
   * live timer this row controls — one clock, two views of it.
   */
  timer: UseTimerResult;
  /** Most recent entry of this type, for the idle row's context line. */
  lastLog: LogEntry | null;
}

/**
 * One activity as one compact row.
 *
 * Idle, the whole activity is a single line — icon, name, when it last
 * happened, and its start controls — so all four daily activities fit in the
 * space one card used to take. Running, the row grows in place into the full
 * timer (clock, side switch, adjust, pause/finish) while the rows around it
 * stay put. Anything needing more input still opens a sheet.
 */
export default function TrackRow({
  type,
  babyId,
  enteredByName,
  onLogSaved,
  timer,
  lastLog,
}: Props) {
  const t = useTheme();
  const tone = useActivityTone(type);
  const toast = useToast();
  const units = useUnits();
  const config = CONFIG[type];
  const label = ACTIVITY_LABEL[type];

  const [note, setNote] = useState("");
  const [diaperStatus, setDiaperStatus] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [showAmount, setShowAmount] = useState(false);
  /**
   * Nap or night, asked when a sleep is finished.
   *
   * Defaulted rather than left empty — the sheet is a confirmation, and making
   * it a required choice would put a decision in front of someone who has just
   * finished settling a baby. It's seeded from the clock only as a starting
   * position, which the toggle is right there to correct.
   */
  const [sleepKind, setSleepKind] = useState<"nap" | "night">("nap");
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const amountValue = units.parseVolume(amount);
  const amountValid = !isNaN(amountValue) && amountValue > 0;

  const reset = useCallback(() => {
    setNote("");
    setDiaperStatus(null);
    setAmount("");
    setShowAmount(false);
    setSleepKind("nap");
  }, []);

  const cancelAll = useCallback(() => {
    reset();
    timer.handleCancel();
  }, [reset, timer]);

  /** Save the finished timed session (or the nappy change). */
  const saveSession = useCallback(async () => {
    const start = timer.getOriginalStartTime() ?? timer.startTime;
    if (!start) return;
    const end = timer.getEndTime() ?? new Date();
    const timeline = timer.getTimeline();

    setSaving(true);
    try {
      await createLog({
        babyId,
        type,
        side: timer.activeSide,
        diaperStatus: type === "diaper" ? diaperStatus : null,
        sleepKind: type === "sleep" ? sleepKind : null,
        // A finished pump is measured, not annotated: the useful thing to
        // capture is how much came out, so that sheet asks for millilitres
        // where every other activity asks for a note.
        amountMl: type === "pump" && amountValid ? amountValue : null,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        comments: type === "pump" ? null : note.trim() || null,
        enteredByName,
        pauseTimeline: timeline.length > 0 ? timeline : null,
      });
      onLogSaved();
      toast.success(`${label} saved.`);
      reset();
      timer.handleCancel();
    } catch (err) {
      toast.showError(err);
    } finally {
      setSaving(false);
    }
  }, [
    babyId, type, timer, diaperStatus, note, amountValid, amountValue, sleepKind,
    enteredByName, onLogSaved, toast, label, reset,
  ]);

  const saveAmount = useCallback(async () => {
    if (!amountValid || saving) return;
    const now = new Date();
    setSaving(true);
    try {
      await createLog({
        babyId,
        type,
        side: null,
        amountMl: amountValue,
        startTime: now.toISOString(),
        endTime: now.toISOString(),
        enteredByName,
      });
      onLogSaved();
      toast.success(`${units.formatVolume(amountValue)} logged.`);
      reset();
    } catch (err) {
      toast.showError(err);
    } finally {
      setSaving(false);
    }
  }, [
    amountValid, amountValue, saving, babyId, type,
    enteredByName, onLogSaved, toast, units, reset,
  ]);

  /*
   * Seed the nap/night choice from when the sleep began.
   *
   * A guess, not a decision: it only sets where the toggle starts, and the
   * toggle is on screen to be corrected. Nothing is ever saved from the clock
   * alone — a sleep logged before this existed stays unlabelled rather than
   * being backfilled with an assumption.
   */
  useEffect(() => {
    if (type !== "sleep" || !timer.showComment) return;
    const start = timer.getOriginalStartTime() ?? new Date();
    const hour = start.getHours();
    setSleepKind(hour >= 19 || hour < 6 ? "night" : "nap");
    // getOriginalStartTime is stable; re-running on it would fight the toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, timer.showComment]);

  const running = timer.isActive;
  /*
   * The true start, not the current segment's.
   *
   * getOriginalStartTime survives pauses and the ±1 minute adjustments, so the
   * label keeps naming the moment the session began rather than the last time
   * it resumed. Recomputed each render, which is what keeps it honest after an
   * adjustment; it changes only when the timer says it did.
   */
  const startedAt = running ? timer.getOriginalStartTime() ?? timer.startTime : null;

  /*
   * Which sheet is asking for input. One Modal that swaps its contents can't
   * race with itself the way two stacked Modals would on iOS.
   */
  const sheet = timer.showDiaperStatus
    ? "status"
    : timer.showComment
      ? "note"
      : showAmount
        ? "amount"
        : null;

  // Hold the last shown kind through the dismiss animation.
  const lastSheet = useRef<"status" | "note" | "amount">("note");
  if (sheet) lastSheet.current = sheet;
  const shown = sheet ?? lastSheet.current;

  /** Context line under the activity name while idle. */
  const idleMeta = (() => {
    if (!lastLog) return "Nothing yet";
    const rel = formatRelativeTime(lastLog.startTime);
    if (type === "feed" || type === "pump") {
      const side =
        lastLog.side === "left" ? "L" : lastLog.side === "right" ? "R" : null;
      const amt =
        lastLog.amountMl != null ? units.formatVolume(lastLog.amountMl) : null;
      return [rel, side ?? amt].filter(Boolean).join(" · ");
    }
    if (type === "diaper") {
      const meta = lastLog.diaperStatus ? DIAPER_META[lastLog.diaperStatus] : null;
      return [rel, meta?.label].filter(Boolean).join(" · ");
    }
    if (type === "sleep") {
      const dur = lastLog.durationMinutes
        ? formatDuration(lastLog.durationMinutes)
        : null;
      return [rel, dur].filter(Boolean).join(" · ");
    }
    return rel;
  })();

  /* ---------------------------------------------------------------- active */

  if (running) {
    return (
      <>
        <View
          style={[
            styles.runBox,
            { borderColor: tone.border, backgroundColor: t.surface },
          ]}
        >
          <View style={styles.activeHeader}>
            <View style={styles.rowCenter}>
              <Emoji size={18}>{tone.emoji}</Emoji>
              <Text variant="subheadStrong" style={{ color: tone.text }}>
                {label}
              </Text>
            </View>
            <Badge tone={timer.paused ? "warning" : "success"}>
              {timer.paused ? "Paused" : "Running"}
            </Badge>
          </View>

          <Text
            variant="display"
            tabular
            center
            style={styles.clock}
            accessibilityLabel={`Elapsed ${Math.floor(timer.elapsed / 60)} minutes`}
          >
            {formatTimer(timer.elapsed)}
          </Text>

          {/* When the clock started, spelled out.
              A running total answers "how long", never "since when" — and after
              an hour or two those are different questions. It reads the true
              start, so a session that was paused, resumed or nudged with the
              adjust buttons still names the moment it actually began. */}
          {startedAt && (
            <Text variant="caption" tone="subtle" center tabular>
              started {formatTime(startedAt.toISOString())}
            </Text>
          )}

          {/* Babies swap breast mid-feed constantly; the running session just
              moves across rather than splitting into two entries. */}
          {config.hasSides && timer.activeSide && (
            <View style={styles.switchRow}>
              {(["left", "right"] as const).map((side) => {
                const current = timer.activeSide === side;
                return (
                  <Pressable
                    key={side}
                    onPress={() => timer.switchSide(side)}
                    hitSlop={hitSlop}
                    accessibilityRole="button"
                    accessibilityState={{ selected: current }}
                    accessibilityLabel={
                      current
                        ? `Currently on the ${side}`
                        : `Switch to the ${side}`
                    }
                    style={({ pressed }) => [
                      styles.switchBtn,
                      {
                        backgroundColor: current ? tone.soft : "transparent",
                        borderColor: current ? tone.border : t.border,
                        opacity: pressed ? PRESSED_OPACITY : 1,
                      },
                    ]}
                  >
                    <Text
                      variant="subheadStrong"
                      style={{ color: current ? tone.text : t.textSubtle }}
                    >
                      {side === "left" ? "Left" : "Right"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Backdate a late tap without abandoning the session. */}
          <View style={styles.adjustRow}>
            <IconButton
              icon="minus"
              label="Subtract 1 minute from elapsed time"
              variant="surface"
              size="sm"
              disabled={timer.elapsed < 60}
              onPress={() => timer.adjustStart(-60)}
            />
            <Text variant="caption" tone="subtle">
              adjust start · 1 min
            </Text>
            <IconButton
              icon="plus"
              label="Add 1 minute to elapsed time"
              variant="surface"
              size="sm"
              onPress={() => timer.adjustStart(60)}
            />
          </View>

          {/* Pause/Finish/Cancel share one row. Cancel is confirmed — the
              elapsed time can't be recovered once discarded. */}
          <View style={styles.controlRow}>
            {timer.paused ? (
              <Button
                label="Resume"
                icon="play"
                variant="success"
                size="sm"
                onPress={timer.handleResume}
                style={styles.flex}
              />
            ) : (
              <Button
                label="Pause"
                icon="pause"
                variant="secondary"
                size="sm"
                onPress={timer.handlePause}
                style={styles.flex}
              />
            )}
            <Button
              label="Finish"
              icon="stop"
              variant="primary"
              size="sm"
              onPress={timer.handleStop}
              style={styles.flex}
            />
            <Button
              label="Cancel"
              variant="ghost"
              size="sm"
              onPress={() => setConfirmDiscard(true)}
              style={styles.flex}
            />
          </View>
        </View>

        <ConfirmDialog
          visible={confirmDiscard}
          icon="trash"
          title={`Discard this ${label.toLowerCase()}?`}
          message={`${formatTimer(timer.elapsed)} will be thrown away and nothing will be saved.`}
          confirmLabel="Discard"
          cancelLabel="Keep going"
          onConfirm={() => {
            setConfirmDiscard(false);
            cancelAll();
          }}
          onCancel={() => setConfirmDiscard(false)}
        />

        <TrackSheet
          shown={shown}
          visible={sheet !== null}
          type={type}
          label={label}
          config={config}
          diaperStatus={diaperStatus}
          elapsed={timer.elapsed}
          amount={amount}
          amountValid={amountValid}
          note={note}
          saving={saving}
          units={units}
          onClose={cancelAll}
          onPickStatus={(value) => {
            setDiaperStatus(value);
            timer.handleDiaperStatusSelect(value);
          }}
          onChangeAmount={setAmount}
          onChangeNote={setNote}
          sleepKind={sleepKind}
          onChangeSleepKind={setSleepKind}
          onSaveAmount={saveAmount}
          onSaveSession={saveSession}
        />
      </>
    );
  }

  /* ------------------------------------------------------------- idle row */

  return (
    <>
      <View style={styles.row}>
        <View style={styles.left}>
          <View style={[styles.iconChip, { backgroundColor: tone.soft }]}>
            <Emoji size={19}>{tone.emoji}</Emoji>
          </View>
          <View style={styles.nameCol}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {label}
            </Text>
            <Text variant="caption" tone="subtle" tabular numberOfLines={1}>
              {idleMeta}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          {type === "diaper" ? (
            <MiniButton
              label="Log"
              icon="plus"
              a11y="Log a diaper change"
              onPress={timer.openDiaperStatus}
            />
          ) : config.hasSides ? (
            <>
              <MiniButton
                label="L"
                wide
                a11y={`Start ${label.toLowerCase()} on the left`}
                onPress={() => timer.handleStart("left")}
              />
              <MiniButton
                label="R"
                wide
                a11y={`Start ${label.toLowerCase()} on the right`}
                onPress={() => timer.handleStart("right")}
              />
              {config.hasAmount && (
                <MiniButton
                  emoji="🍼"
                  a11y={`Log a bottle ${label.toLowerCase()} by volume`}
                  onPress={() => setShowAmount(true)}
                />
              )}
            </>
          ) : (
            <MiniButton
              label="Start"
              icon="play"
              a11y={`Start ${label.toLowerCase()}`}
              onPress={() => timer.handleStart()}
            />
          )}
        </View>
      </View>

      <TrackSheet
        shown={shown}
        visible={sheet !== null}
        type={type}
        label={label}
        config={config}
        diaperStatus={diaperStatus}
        elapsed={timer.elapsed}
        amount={amount}
        amountValid={amountValid}
        note={note}
        saving={saving}
        units={units}
        onClose={cancelAll}
        onPickStatus={(value) => {
          setDiaperStatus(value);
          timer.handleDiaperStatusSelect(value);
        }}
        onChangeAmount={setAmount}
        onChangeNote={setNote}
        sleepKind={sleepKind}
        onChangeSleepKind={setSleepKind}
        onSaveAmount={saveAmount}
        onSaveSession={saveSession}
      />
    </>
  );
}

/** Compact start action — a letter, a word, or an emoji. `wide` gives the
 *  single-letter L/R taps a more comfortable, tappable footprint. */
function MiniButton({
  label,
  emoji,
  icon,
  a11y,
  wide,
  onPress,
}: {
  label?: string;
  emoji?: string;
  icon?: "plus" | "play";
  a11y: string;
  wide?: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [
        styles.mini,
        wide && styles.miniWide,
        {
          backgroundColor: t.accentSofter,
          borderColor: t.borderStrong,
          opacity: pressed ? PRESSED_OPACITY : 1,
        },
      ]}
    >
      {emoji ? <Emoji size={20}>{emoji}</Emoji> : null}
      {icon === "plus" ? (
        <Text variant="title3" style={{ color: t.accentText }}>＋</Text>
      ) : icon === "play" ? (
        <Text variant="title3" style={{ color: t.accentText }}>▶</Text>
      ) : null}
      {label ? (
        <Text variant="bodyStrong" style={{ color: t.accentText }}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared input sheet (status / amount / note)                                 */
/* -------------------------------------------------------------------------- */

function TrackSheet({
  shown,
  visible,
  type,
  label,
  config,
  diaperStatus,
  elapsed,
  amount,
  amountValid,
  note,
  saving,
  units,
  sleepKind,
  onClose,
  onPickStatus,
  onChangeAmount,
  onChangeNote,
  onChangeSleepKind,
  onSaveAmount,
  onSaveSession,
}: {
  shown: "status" | "note" | "amount";
  visible: boolean;
  type: TrackType;
  label: string;
  config: Config;
  diaperStatus: string | null;
  elapsed: number;
  amount: string;
  amountValid: boolean;
  note: string;
  saving: boolean;
  units: ReturnType<typeof useUnits>;
  sleepKind: "nap" | "night";
  onClose: () => void;
  onPickStatus: (value: string) => void;
  onChangeAmount: (value: string) => void;
  onChangeNote: (value: string) => void;
  onChangeSleepKind: (kind: "nap" | "night") => void;
  onSaveAmount: () => void;
  onSaveSession: () => void;
}) {
  const t = useTheme();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={
        shown === "status"
          ? "What was it?"
          : shown === "amount"
            ? config.amountLabel ?? "Amount"
            : `Save this ${label.toLowerCase()}?`
      }
      subtitle={
        shown === "status"
          ? "Tap one to continue"
          : shown === "amount"
            ? "Logged as a one-off, not timed"
            : type === "diaper"
              ? DIAPER_META[diaperStatus ?? ""]?.label
              : `${formatTimer(elapsed)} elapsed`
      }
      footer={
        shown === "status" ? undefined : (
          <View style={styles.controlRow}>
            <Button
              label={shown === "amount" ? "Cancel" : "Discard"}
              variant="ghost"
              onPress={onClose}
              style={styles.flex}
            />
            <Button
              label="Save"
              variant="primary"
              loading={saving}
              // A blank pump amount is fine — a half-typed one is not.
              disabled={
                (shown === "amount" && !amountValid) ||
                (shown === "note" &&
                  type === "pump" &&
                  amount.length > 0 &&
                  !amountValid)
              }
              onPress={shown === "amount" ? onSaveAmount : onSaveSession}
              style={styles.flex}
            />
          </View>
        )
      }
    >
      {shown === "status" ? (
        <View style={styles.statusGrid}>
          {DIAPER_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => onPickStatus(opt.value)}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              style={({ pressed }) => [
                styles.statusTile,
                {
                  backgroundColor: t.accentSofter,
                  borderColor: t.borderStrong,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Emoji size={22}>{opt.emoji}</Emoji>
              <Text variant="subheadStrong" style={{ color: t.accentText }}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : shown === "amount" ? (
        <Input
          label="How much?"
          suffix={units.volume}
          value={amount}
          onChangeText={onChangeAmount}
          placeholder={units.system === "metric" ? "120" : "4"}
          keyboardType="decimal-pad"
          autoFocus
          error={
            amount.length > 0 && !amountValid
              ? "Enter an amount greater than zero."
              : null
          }
        />
      ) : type === "sleep" ? (
        /* Nap or night, then the note. Which one it was is the difference
           between "slept 11 hours" and "slept 11 hours across six naps", and
           it can't be recovered later from the timestamps alone. */
        <>
          <Field label="Was this a nap or the night?">
            <View style={styles.kindRow}>
              {SLEEP_KINDS.map((option) => {
                const selected = sleepKind === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => onChangeSleepKind(option.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={option.label}
                    style={({ pressed }) => [
                      styles.kindBtn,
                      {
                        backgroundColor: selected ? t.accent : t.accentSofter,
                        borderColor: selected ? t.accent : t.borderStrong,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Emoji size={18}>{option.emoji}</Emoji>
                    <Text
                      variant="subheadStrong"
                      style={{ color: selected ? t.onAccent : t.accentText }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>
          <Input
            label="Note"
            helper="Optional — anything worth remembering about this one."
            value={note}
            onChangeText={onChangeNote}
            placeholder="Woke twice, took a while to settle…"
            returnKeyType="done"
          />
        </>
      ) : type === "pump" ? (
        /* Finishing a pump asks for the yield rather than a note — that number
           is the point of the session, and burying it behind a manual entry
           afterwards is how it goes unrecorded. */
        <Input
          label="How much did you pump?"
          suffix={units.volume}
          helper="Leave it blank if you didn't measure."
          value={amount}
          onChangeText={onChangeAmount}
          placeholder={units.system === "metric" ? "120" : "4"}
          keyboardType="decimal-pad"
          autoFocus
          error={
            amount.length > 0 && !amountValid
              ? "Enter an amount greater than zero."
              : null
          }
        />
      ) : (
        <Input
          label="Note"
          helper="Optional — anything worth remembering about this one."
          value={note}
          onChangeText={onChangeNote}
          placeholder="Fussy, fell asleep halfway…"
          returnKeyType="done"
        />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: space.sm },

  /* idle row */
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 64,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    flex: 1,
    minWidth: 0,
  },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  nameCol: { flex: 1, minWidth: 0, gap: 1 },
  actions: { flexDirection: "row", gap: space.xs, flexShrink: 0 },
  mini: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    minWidth: 46,
    height: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  // Single-letter L/R get a touch more width so they don't read as cramped.
  miniWide: { minWidth: 54 },

  /* running */
  runBox: {
    margin: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 2,
  },
  activeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  clock: { marginVertical: space.sm },
  switchRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: space.sm,
    marginBottom: space.md,
  },
  switchBtn: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 104,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 2,
  },
  adjustRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
    marginBottom: space.lg,
  },
  controlRow: { flexDirection: "row", gap: space.sm },
  kindRow: { flexDirection: "row", gap: space.sm },
  kindBtn: {
    flex: 1,
    flexDirection: "row",
    height: 52,
    borderRadius: radius.lg,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  statusTile: {
    width: "47.5%",
    flexGrow: 1,
    height: 88,
    borderRadius: radius.lg,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
  },
});
