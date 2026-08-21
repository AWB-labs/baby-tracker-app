import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
  SLEEP_KIND_META,
} from "../design/activity";
import { Text, Badge, Emoji } from "./ui/primitives";
import { Card } from "./ui/Card";
import { Button, IconButton } from "./ui/Button";
import { Input, Field } from "./ui/Input";
import { Sheet } from "./ui/Sheet";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { useToast } from "./Toast";
import { useUnits } from "../context/SettingsContext";
import type { UseTimerResult } from "../hooks/useTimer";
import { createLog, type LogEntry } from "../api/logs";
import {
  startActiveTimer,
  endActiveTimer,
  TimerConflictError,
  type ActiveTimerRecord,
  type TimerType,
} from "../api/activeTimers";
import { formatTimer, formatRelativeTime, formatTime } from "../utils/formatTime";
import { formatDuration } from "../utils/formatDuration";

const DIAPER_OPTIONS = Object.entries(DIAPER_META).map(([value, meta]) => ({
  value,
  ...meta,
}));

interface Config {
  hasSides: boolean;
  hasAmount: boolean;
}

const CONFIG: Record<string, Config> = {
  // Feed is breast (L/R, timed) with a bottle option that's timed the same
  // way — no side, and the amount is asked for on finish rather than up
  // front, since the point is how much was actually taken, not poured.
  feed: { hasSides: true, hasAmount: true },
  // Pump is breast pumping — timed per side, like a feed.
  pump: { hasSides: true, hasAmount: false },
  sleep: { hasSides: false, hasAmount: false },
  diaper: { hasSides: false, hasAmount: false },
};

export type TrackType = "feed" | "pump" | "sleep" | "diaper";

// Only these three are ever claimed as a server-side lock — a diaper change
// is logged instantly (see openDiaperStatus) and never shows a running clock
// for a second caregiver to collide with.
const GERUND: Partial<Record<TrackType, string>> = {
  feed: "feeding",
  pump: "pumping",
  sleep: "sleeping",
};

// Shared with EditLogModal, and defined once in design/activity.ts so the two
// don't drift into describing "nap" differently.
const SLEEP_KINDS = (
  Object.entries(SLEEP_KIND_META) as ["nap" | "night", { emoji: string; label: string }][]
).map(([value, meta]) => ({ value, ...meta }));

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
  /**
   * A feed/pump/sleep already running for this baby, from some device —
   * undefined/null when this activity is free. Only meaningful for feed,
   * pump and sleep; diaper never sets it. When it's this same account's own
   * lock, the row silently takes local control of it (see the adopt effect)
   * rather than showing it read-only.
   */
  remoteActive?: ActiveTimerRecord | null;
  /** The signed-in account viewing this row, to tell "someone else has this
   *  running" apart from "I do, just not from this device". */
  viewerAccountId?: number;
  /**
   * When the server view behind `remoteActive` was requested (ms epoch),
   * null before the first fetch. Lets the row trust "the lock is gone" only
   * from a response newer than its own session — see the reconcile effect.
   */
  activeTimersSyncedAt?: number | null;
  /** Ask the screen to refetch active timers right away, instead of waiting
   *  for the next poll — used after a claim, a release, or a lost race. */
  onActiveTimersChanged?: () => void;
}

/**
 * How much newer than the local session's start a server view must be before
 * "no lock there" is believed. A poll that left before the lock was even
 * created genuinely never saw it — its emptiness says nothing. In practice
 * any fetch initiated before the start POST resolved carries an older
 * timestamp than the session, so a small buffer is enough.
 */
const SYNC_TRUST_BUFFER_MS = 3_000;

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
  remoteActive,
  viewerAccountId,
  activeTimersSyncedAt,
  onActiveTimersChanged,
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
  // A feed timer started with no side (the bottle button) rather than L/R.
  // handleStop() doesn't clear activeSide, so this still reads correctly
  // once the finish sheet is open.
  const isBottleFeed = type === "feed" && timer.activeSide == null;

  const reset = useCallback(() => {
    setNote("");
    setDiaperStatus(null);
    setAmount("");
    setSleepKind("nap");
  }, []);

  /**
   * Release this row's server-side lock, if it holds one.
   *
   * Awaited before refreshing, not fire-and-forget: refreshing first (or in
   * parallel) could win the race against the DELETE actually landing, so the
   * refetch still finds the just-released lock still there — and with the
   * local timer already cleared by this point, the row reads that as an
   * unadopted session again and re-adopts it, restarting the clock right
   * after it was saved. A request that never lands at all just leaves the
   * lock in place until it goes stale on its own, rather than blocking the
   * local flow on a retry.
   */
  const releaseLock = useCallback(async () => {
    if (!GERUND[type]) return;
    try {
      await endActiveTimer(babyId, type as TimerType);
    } catch {
      // Best-effort — see above.
    }
    onActiveTimersChanged?.();
  }, [type, babyId, onActiveTimersChanged]);

  const cancelAll = useCallback(async () => {
    reset();
    timer.handleCancel();
    await releaseLock();
  }, [reset, timer, releaseLock]);

  /**
   * Claim the server-side lock before actually starting the local clock, so
   * two caregivers reaching for the same activity within the same instant
   * don't both end up timing it. Diaper isn't a lock-worthy type — it never
   * shows a running clock (see openDiaperStatus), so it starts straight away.
   */
  const claimAndStart = useCallback(
    async (side?: "left" | "right") => {
      const gerund = GERUND[type];
      if (!gerund) {
        timer.handleStart(side);
        return;
      }
      try {
        await startActiveTimer({
          babyId,
          type: type as TimerType,
          side: side ?? null,
          startTime: new Date().toISOString(),
          enteredByName,
        });
        timer.handleStart(side);
      } catch (err) {
        if (err instanceof TimerConflictError) {
          toast.error(
            `${label} is already running${
              err.timer ? ` — started by ${err.timer.enteredByName}` : ""
            }.`
          );
          // Our view of who's running what was stale enough to miss this —
          // refetch now instead of waiting out the rest of the poll interval.
          onActiveTimersChanged?.();
        } else {
          toast.showError(err);
        }
      }
    },
    [type, babyId, enteredByName, timer, label, toast, onActiveTimersChanged]
  );

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
        // A finished pump — or a bottle feed, timed the same way — is
        // measured, not annotated: the useful thing to capture is how much
        // came out or was drunk, so that sheet asks for millilitres where
        // every other activity asks for a note.
        amountMl: (type === "pump" || isBottleFeed) && amountValid ? amountValue : null,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        comments: type === "pump" || isBottleFeed ? null : note.trim() || null,
        enteredByName,
        pauseTimeline: timeline.length > 0 ? timeline : null,
      });
      onLogSaved();
      toast.success(`${label} saved.`);
      reset();
      timer.handleCancel();
      await releaseLock();
    } catch (err) {
      toast.showError(err);
    } finally {
      setSaving(false);
    }
  }, [
    babyId, type, timer, diaperStatus, note, amountValid, amountValue, sleepKind,
    isBottleFeed, enteredByName, onLogSaved, toast, label, reset, releaseLock,
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

  // Whether *any* local timer state exists for this activity, whether it's
  // actively running or mid-finish (the note/amount sheet, showComment) or
  // mid-status (diaper). isActive alone goes false during those sub-phases —
  // that's what it's for, switching the row's own UI to the sheet instead of
  // the clock — but it must not be mistaken for "this device has nothing",
  // or a Finish tap would look identical to needing a fresh adopt.
  const hasLocalTimer = timer.startTime !== null;

  // This account's own lock, running somewhere, but not on this device (a
  // second phone, or one that lost its local state) — take local control of
  // it rather than leaving it stuck with no way to end it from here. A
  // layout effect, not a regular one, so it lands before this render's paint
  // and the idle row never has a chance to flash first.
  const ownUnadoptedSession =
    !hasLocalTimer &&
    !!remoteActive &&
    viewerAccountId != null &&
    remoteActive.accountId === viewerAccountId;
  useLayoutEffect(() => {
    if (!ownUnadoptedSession || !remoteActive) return;
    timer.adopt({
      startTime: new Date(remoteActive.startTime),
      side: remoteActive.side,
    });
    // Only re-run if the session identity actually changes — timer itself is
    // stable-ish but re-created per render in the parent, and including it
    // here would re-adopt (and reset any local pause/adjust) every time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownUnadoptedSession, remoteActive?.id]);

  /**
   * The mirror of adopt: this device holds a live local session whose lock
   * has vanished from the server — it was finished or discarded from another
   * device — so the local clock is orphaned and would otherwise keep
   * counting here forever, ready to save a duplicate entry on top of the
   * one already written.
   *
   * Two things keep this from misfiring:
   * - Only a server view *requested after* this session began is believed.
   *   A poll that left the phone before the lock was even created genuinely
   *   never saw it, and its emptiness must not kill the session it missed.
   * - Nothing is touched mid-finish (the note/amount sheet open, or the
   *   save in flight) — the entry is about to be written and yanking the
   *   session would throw it away.
   */
  useEffect(() => {
    if (!GERUND[type] || !hasLocalTimer) return;
    if (timer.showComment || timer.showDiaperStatus || saving) return;
    // Can't judge ownership before the account has loaded.
    if (viewerAccountId == null) return;
    // Our own lock still standing is the normal running case. A different
    // caregiver's lock while we hold a local clock means ours was already
    // released out from under us (theirs couldn't exist otherwise), so that
    // falls through to the cancel below just like an absent lock does.
    if (remoteActive && remoteActive.accountId === viewerAccountId) return;
    if (activeTimersSyncedAt == null) return;
    const started = timer.getOriginalStartTime() ?? timer.startTime;
    if (!started) return;
    if (activeTimersSyncedAt <= started.getTime() + SYNC_TRUST_BUFFER_MS) return;
    timer.handleCancel();
    toast.info(`${label} was finished from another device.`);
    // getOriginalStartTime is a stable accessor; toast/label/timer identities
    // churn per render and would only add noise here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    type,
    hasLocalTimer,
    remoteActive,
    viewerAccountId,
    activeTimersSyncedAt,
    saving,
    timer.showComment,
    timer.showDiaperStatus,
  ]);

  // Someone else's lock — read-only, informational.
  const lockedByOther =
    !hasLocalTimer && !!remoteActive && !ownUnadoptedSession
      ? remoteActive
      : null;

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
      : null;

  // Hold the last shown kind through the dismiss animation.
  const lastSheet = useRef<"status" | "note">("note");
  if (sheet) lastSheet.current = sheet;
  const shown = sheet ?? lastSheet.current;

  /** Context line under the activity name while idle. */
  const idleMeta = (() => {
    if (!lastLog) return "Nothing yet";
    if (type === "sleep") {
      // Unlike the others, a sleep reads better counted from when it ended:
      // "how long has the baby been awake" is the useful question, and for
      // an hours-long nap, "started" and "ended" can be very different, more
      // alarming-looking numbers.
      const rel = formatRelativeTime(lastLog.endTime ?? lastLog.startTime);
      const dur = lastLog.durationMinutes
        ? formatDuration(lastLog.durationMinutes)
        : null;
      return [rel, dur].filter(Boolean).join(" · ");
    }
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
              adjust timer · 1 min
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
          isBottleFeed={isBottleFeed}
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
          onSaveSession={saveSession}
        />
      </>
    );
  }

  /* --------------------------------------------------------- locked row */

  // Someone else already has this timer running — shown instead of the idle
  // row's Start controls, not alongside them, so there's nothing here to tap
  // into a duplicate session with. (This account's own lock never reaches
  // here — see ownUnadoptedSession above, which takes local control instead.)
  if (lockedByOther) {
    return (
      <Card
        padded={false}
        style={styles.row}
        accessible
        accessibilityLabel={`${label}: currently ${GERUND[type]}, started by ${
          lockedByOther.enteredByName
        } ${formatRelativeTime(lockedByOther.startTime)}`}
      >
        <View style={styles.left}>
          <View style={[styles.iconChip, { backgroundColor: tone.soft }]}>
            <Emoji size={22}>{tone.emoji}</Emoji>
          </View>
          <View style={styles.nameCol}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {label}
            </Text>
            <Text variant="caption" tone="subtle" numberOfLines={1}>
              Currently {GERUND[type]} · by {lockedByOther.enteredByName}
            </Text>
          </View>
        </View>

        <Badge tone="success">Running</Badge>
      </Card>
    );
  }

  // Own session not yet adopted — the layout effect above fires before this
  // paints, so in practice this is never actually seen; it exists only so
  // the row renders *something* stable rather than a flash of Start buttons
  // if a future change ever delays the effect.
  if (ownUnadoptedSession) {
    return null;
  }

  /* ------------------------------------------------------------- idle row */

  return (
    <>
      {/* Its own horizontal card, not a thin shared-list row — the four
          activities used to sit stacked in one Card divided by hairlines, with
          40pt buttons crammed against the right edge to fit. Standing alone
          each row can afford real padding and touch targets sized properly,
          rather than everyone splitting one card's width. */}
      <Card padded={false} style={styles.row}>
        <View style={styles.left}>
          <View style={[styles.iconChip, { backgroundColor: tone.soft }]}>
            <Emoji size={22}>{tone.emoji}</Emoji>
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
              fixed
              a11y="Log a diaper change"
              onPress={timer.openDiaperStatus}
            />
          ) : config.hasSides ? (
            <>
              <MiniButton
                label="L"
                wide
                a11y={`Start ${label.toLowerCase()} on the left`}
                onPress={() => claimAndStart("left")}
              />
              <MiniButton
                label="R"
                wide
                a11y={`Start ${label.toLowerCase()} on the right`}
                onPress={() => claimAndStart("right")}
              />
              {config.hasAmount && (
                <MiniButton
                  emoji="🍼"
                  a11y={`Start a bottle ${label.toLowerCase()}`}
                  onPress={() => claimAndStart()}
                />
              )}
            </>
          ) : (
            <MiniButton
              label="Start"
              icon="play"
              fixed
              a11y={`Start ${label.toLowerCase()}`}
              onPress={() => claimAndStart()}
            />
          )}
        </View>
      </Card>

      <TrackSheet
        shown={shown}
        visible={sheet !== null}
        type={type}
        label={label}
        config={config}
        diaperStatus={diaperStatus}
        isBottleFeed={isBottleFeed}
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
        onSaveSession={saveSession}
      />
    </>
  );
}

/** Compact start action — a letter, a word, or an emoji. `wide` gives the
 *  single-letter L/R taps a more comfortable, tappable footprint. `fixed`
 *  gives a standalone action (Start, Log) a shared width, so a row's button
 *  doesn't run wider or narrower than another row's just because its label
 *  is a different length. */
function MiniButton({
  label,
  emoji,
  icon,
  a11y,
  wide,
  fixed,
  onPress,
}: {
  label?: string;
  emoji?: string;
  icon?: "plus" | "play";
  a11y: string;
  wide?: boolean;
  fixed?: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [
        styles.mini,
        wide && styles.miniWide,
        fixed && styles.miniFixed,
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
  isBottleFeed,
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
  onSaveSession,
}: {
  shown: "status" | "note";
  visible: boolean;
  type: TrackType;
  label: string;
  config: Config;
  diaperStatus: string | null;
  /** A feed session started with no side — the bottle button, timed the same
   *  as breastfeeding — so finishing asks for the amount, not a note. */
  isBottleFeed: boolean;
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
  onSaveSession: () => void;
}) {
  const t = useTheme();
  const asksForAmount = type === "pump" || isBottleFeed;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={shown === "status" ? "What was it?" : `Save this ${label.toLowerCase()}?`}
      subtitle={
        shown === "status"
          ? "Tap one to continue"
          : type === "diaper"
            ? DIAPER_META[diaperStatus ?? ""]?.label
            : `${formatTimer(elapsed)} elapsed`
      }
      footer={
        shown === "status" ? undefined : (
          <View style={styles.controlRow}>
            <Button
              label="Discard"
              variant="ghost"
              onPress={onClose}
              style={styles.flex}
            />
            <Button
              label="Save"
              variant="primary"
              loading={saving}
              // A blank amount is fine — a half-typed one is not.
              disabled={asksForAmount && amount.length > 0 && !amountValid}
              onPress={onSaveSession}
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
      ) : asksForAmount ? (
        /* Finishing a pump or a bottle asks for the yield rather than a note —
           that number is the point of the session, and burying it behind a
           manual entry afterwards is how it goes unrecorded. */
        <Input
          label={isBottleFeed ? "How much did they drink?" : "How much did you pump?"}
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
    paddingVertical: space.lg,
    minHeight: 76,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    flex: 1,
    minWidth: 0,
  },
  iconChip: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  nameCol: { flex: 1, minWidth: 0, gap: 2 },
  actions: { flexDirection: "row", gap: space.sm, flexShrink: 0 },
  mini: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    minWidth: 52,
    height: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  // Single-letter L/R get a touch more width so they don't read as cramped.
  miniWide: { minWidth: 60 },
  // A fixed rather than minimum width — otherwise "Start" and "Log" render at
  // two different sizes purely because the words are different lengths.
  miniFixed: { width: 96, minWidth: 0 },

  /* running */
  // No outer margin: this used to sit inset within one shared unpadded Card;
  // now each row stands alone and the gap between cards comes from the list's
  // own spacing, in HomeScreen, rather than a margin baked into the row.
  runBox: {
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
