import { useState, useEffect, useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TimelineEvent } from "../api/logs";

export type ActivityType =
  | "pump"
  | "feed"
  | "sleep"
  | "diaper"
  | "shower"
  | "vitamin"
  | "nailcut";

/** Seconds spent on each breast, for a feed or pump that switched sides. */
export interface SideSeconds {
  left: number;
  right: number;
}

const NO_SIDE_SECONDS: SideSeconds = { left: 0, right: 0 };

export interface TimerState {
  /** True start of the activity, unaffected by pauses. Saved as startTime. */
  originalStartTimeISO: string;
  /** Start of the current running segment (moves forward on every resume). */
  startTimeISO: string;
  pausedElapsed: number; // seconds accumulated before startTimeISO
  paused: boolean;
  pausedAtISO: string | null;
  activeSide: "left" | "right" | null;
  /**
   * Seconds banked on each side by the switches already made — the side
   * currently active is NOT included here, since its segment is still
   * running. Absent on a state saved before per-side timing existed.
   */
  sideSeconds?: SideSeconds;
  /**
   * When THIS DEVICE took control of the session (started it, or adopted
   * it from another device) — wall-clock, never moved by the ±1 minute
   * adjustments the way the start times are. The reconcile logic in
   * TrackRow needs exactly this: "was that server view requested after
   * this device began its session", a question the backdatable start time
   * answers wrongly. Absent on a state saved before it existed.
   */
  claimedAtISO?: string | null;
  /**
   * Seconds the start has been moved earlier by the + button — a late Start
   * tap being backdated. The − button takes these back first, before it
   * starts cutting from the end. Absent on older saved states.
   */
  backdatedSeconds?: number;
  /**
   * Seconds cut from the end by the − button, while paused at that earlier
   * end. The + button gives these back first. Absent on older saved states.
   */
  trimmedSeconds?: number;
  /**
   * Whether the current pause came from cutting the end ("it actually
   * finished earlier") rather than the Pause button. Saving drops that pause
   * from the timeline, since nobody paused. Undoing the cut completely
   * resumes the session as if it was never paused.
   */
  trimPaused?: boolean;
  timeline: TimelineEvent[];
  babyId: number;
}

/**
 * Split the total elapsed time across the two sides.
 *
 * The banked seconds only cover switches already made; whatever the total
 * hasn't accounted for belongs to the side running now. Deriving the active
 * side's share rather than ticking it separately is what makes pause, resume
 * and the ±1 minute adjustments need no per-side handling of their own — they
 * move `elapsed`, and this follows.
 *
 * The parts are made to sum to the whole even after a backwards adjustment
 * has pushed the total below what was already banked: a breakdown that
 * disagrees with the duration beside it is worse than one scaled to fit.
 */
export function resolveSideSeconds(
  banked: SideSeconds,
  activeSide: "left" | "right" | null,
  totalElapsed: number
): SideSeconds | null {
  if (!activeSide) return null;
  const bankedTotal = banked.left + banked.right;
  const current = Math.max(0, totalElapsed - bankedTotal);
  const resolved: SideSeconds = {
    ...banked,
    [activeSide]: banked[activeSide] + current,
  };
  const sum = resolved.left + resolved.right;
  if (sum > totalElapsed && sum > 0) {
    const scale = totalElapsed / sum;
    return { left: resolved.left * scale, right: resolved.right * scale };
  }
  return resolved;
}

function storageKey(type: ActivityType, babyId: number): string {
  return `babytracker_timer_${type}_${babyId}`;
}

async function saveTimerState(
  type: ActivityType,
  babyId: number,
  state: TimerState
): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(type, babyId), JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

async function loadTimerState(
  type: ActivityType,
  babyId: number
): Promise<TimerState | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(type, babyId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function clearTimerState(
  type: ActivityType,
  babyId: number
): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(type, babyId));
  } catch {
    /* ignore */
  }
}

export interface UseTimerResult {
  elapsed: number;
  paused: boolean;
  activeSide: "left" | "right" | null;
  startTime: Date | null;
  isActive: boolean;
  isRunning: boolean;
  handleStart: (side?: "left" | "right") => void;
  /** Locally take over a session already running server-side under this
   *  account but not started on this device — see the implementation. */
  adopt: (input: { startTime: Date; side: "left" | "right" | null }) => void;
  handlePause: () => void;
  handleResume: () => void;
  handleStop: () => void; // opens the note form
  handleCancel: () => void;
  /** Move a running session to the other breast without restarting it. */
  switchSide: (side: "left" | "right") => void;
  /**
   * Live split of `elapsed` across the two breasts, or null when this
   * session has no side at all (a bottle). Only interesting once a switch
   * has happened — before that it's simply all on the starting side.
   */
  sideSeconds: SideSeconds | null;
  /** Whether this session has actually been fed on both sides. */
  usedBothSides: boolean;
  /** The final per-side split, for the saved log. */
  getSideSeconds: () => SideSeconds | null;
  /**
   * Add (positive) or take away (negative) elapsed time, in seconds. Adding
   * backdates the start (a late Start tap). Taking away first undoes any
   * backdating, then cuts from the END and pauses there (a forgotten Finish
   * tap), so the start the session really had is never moved. Returns
   * whether anything changed.
   */
  adjust: (deltaSeconds: number) => boolean;
  /** Whether `adjust` with a negative amount has anything left to take. */
  canSubtract: boolean;
  showComment: boolean;
  showDiaperStatus: boolean;
  openDiaperStatus: () => void;
  handleDiaperStatusSelect: (status: string) => void;
  /** Begin an instant log that still needs a follow-up form (start === end). */
  markInstant: () => void;
  /** True start of the activity, for the saved log. */
  getOriginalStartTime: () => Date | null;
  /**
   * When this device took control of the session (start or adopt) —
   * unaffected by backdating, unlike the start times. Null when idle.
   */
  getClaimedAt: () => Date | null;
  getEndTime: () => Date | null;
  getTimeline: () => TimelineEvent[];
}

export function useTimer(
  type: ActivityType,
  babyId: number | undefined
): UseTimerResult {
  const [activeSide, setActiveSide] = useState<"left" | "right" | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [showDiaperStatus, setShowDiaperStatus] = useState(false);

  const pausedElapsedRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endTimeRef = useRef<Date | null>(null);
  const originalStartTimeRef = useRef<Date | null>(null);
  const timelineRef = useRef<TimelineEvent[]>([]);
  const restoredRef = useRef(false);
  /**
   * Seconds banked on each side by switches already made. A ref, like
   * pausedElapsedRef: it's only ever *read* through resolveSideSeconds
   * during render, and every write to it is paired with a state change
   * (setActiveSide) that re-renders anyway.
   */
  const bankedSideRef = useRef<SideSeconds>(NO_SIDE_SECONDS);
  /** See TimerState.claimedAtISO — when this device took the session over. */
  const claimedAtRef = useRef<Date | null>(null);
  /** See TimerState.backdatedSeconds / trimmedSeconds / trimPaused. */
  const backdatedRef = useRef(0);
  const trimmedRef = useRef(0);
  const trimPausedRef = useRef(false);
  /*
   * Mirrors of the `startTime` and `paused` state, written at the same time
   * as the state. `adjust` reads these rather than the state because holding
   * the −/+ button calls it several times a second, faster than a re-render
   * is guaranteed to deliver the previous call's result.
   */
  const startTimeRef = useRef<Date | null>(null);
  const pausedRef = useRef(false);
  const applyStartTime = useCallback((next: Date | null) => {
    startTimeRef.current = next;
    setStartTime(next);
  }, []);
  const applyPaused = useCallback((next: boolean) => {
    pausedRef.current = next;
    setPaused(next);
  }, []);
  /** Clear the ± bookkeeping — a new, adopted or ended session has none. */
  const resetAdjustments = useCallback(() => {
    backdatedRef.current = 0;
    trimmedRef.current = 0;
    trimPausedRef.current = false;
  }, []);

  // Restore persisted state on mount / babyId change
  useEffect(() => {
    if (!babyId) return;
    restoredRef.current = false;
    applyStartTime(null);
    setElapsed(0);
    applyPaused(false);
    setActiveSide(null);
    setShowComment(false);
    setShowDiaperStatus(false);
    pausedElapsedRef.current = 0;
    endTimeRef.current = null;
    originalStartTimeRef.current = null;
    timelineRef.current = [];
    bankedSideRef.current = NO_SIDE_SECONDS;
    claimedAtRef.current = null;
    resetAdjustments();

    loadTimerState(type, babyId).then((saved) => {
      if (!saved || restoredRef.current) return;
      restoredRef.current = true;
      const restored = new Date(saved.startTimeISO);
      const originalStart = new Date(
        saved.originalStartTimeISO ?? saved.startTimeISO
      );
      if (isNaN(restored.getTime()) || isNaN(originalStart.getTime())) return;
      setActiveSide(saved.activeSide);
      pausedElapsedRef.current = saved.pausedElapsed;
      applyPaused(saved.paused);
      applyStartTime(restored);
      originalStartTimeRef.current = originalStart;
      timelineRef.current = Array.isArray(saved.timeline) ? saved.timeline : [];
      // Absent on a session started before per-side timing shipped; zero is
      // right for it either way, since nothing was ever banked.
      bankedSideRef.current = saved.sideSeconds ?? NO_SIDE_SECONDS;
      // Absent on an older saved state; the running-segment start is the
      // closest surviving stand-in for when this device took the session.
      claimedAtRef.current = saved.claimedAtISO
        ? new Date(saved.claimedAtISO)
        : restored;
      // All absent on a state saved before the minus button cut from the end.
      backdatedRef.current = saved.backdatedSeconds ?? 0;
      trimmedRef.current = saved.trimmedSeconds ?? 0;
      trimPausedRef.current = !!saved.trimPaused;
      if (saved.paused) {
        setElapsed(saved.pausedElapsed);
        if (saved.pausedAtISO) endTimeRef.current = new Date(saved.pausedAtISO);
      } else {
        setElapsed(
          saved.pausedElapsed +
            Math.floor((Date.now() - restored.getTime()) / 1000)
        );
      }
    });

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [type, babyId, applyStartTime, applyPaused, resetAdjustments]);

  // Tick
  useEffect(() => {
    if (startTime && !showComment && !paused) {
      intervalRef.current = setInterval(() => {
        setElapsed(
          pausedElapsedRef.current +
            Math.floor((Date.now() - startTime.getTime()) / 1000)
        );
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startTime, showComment, paused]);

  /**
   * `sideSeconds` is filled in here rather than by each caller: every one of
   * them would pass the same ref, and a switch that forgot to would silently
   * roll the banked time back to whatever was last written.
   */
  const persist = useCallback(
    (
      state: Omit<
        TimerState,
        | "babyId"
        | "sideSeconds"
        | "claimedAtISO"
        | "backdatedSeconds"
        | "trimmedSeconds"
        | "trimPaused"
      >
    ) => {
      if (!babyId) return;
      saveTimerState(type, babyId, {
        ...state,
        sideSeconds: bankedSideRef.current,
        claimedAtISO: claimedAtRef.current
          ? claimedAtRef.current.toISOString()
          : null,
        backdatedSeconds: backdatedRef.current,
        trimmedSeconds: trimmedRef.current,
        trimPaused: trimPausedRef.current,
        babyId,
      });
    },
    [type, babyId]
  );

  const handleStart = useCallback(
    (side?: "left" | "right") => {
      if (!babyId) return;
      const now = new Date();
      setActiveSide(side || null);
      applyStartTime(now);
      setElapsed(0);
      applyPaused(false);
      pausedElapsedRef.current = 0;
      endTimeRef.current = null;
      originalStartTimeRef.current = now;
      timelineRef.current = [{ event: "started", at: now.toISOString() }];
      bankedSideRef.current = NO_SIDE_SECONDS;
      claimedAtRef.current = now;
      resetAdjustments();
      persist({
        originalStartTimeISO: now.toISOString(),
        startTimeISO: now.toISOString(),
        pausedElapsed: 0,
        paused: false,
        pausedAtISO: null,
        activeSide: side || null,
        timeline: timelineRef.current,
      });
    },
    [babyId, persist, applyStartTime, applyPaused, resetAdjustments]
  );

  /**
   * Take local control of a session that's already running server-side under
   * this same account, but that this device never started itself — a second
   * phone, or one where the app's local storage was lost. Elapsed is counted
   * from the true `startTime` the lock was created with rather than from now,
   * so the clock and the eventual saved log both read correctly; everything
   * after this (pause, adjust, finish, cancel) is the same local machinery
   * handleStart sets up, just seeded from history instead of the present.
   */
  const adopt = useCallback(
    (input: { startTime: Date; side: "left" | "right" | null }) => {
      if (!babyId) return;
      const { startTime: original, side } = input;
      setActiveSide(side);
      applyStartTime(original);
      setElapsed(Math.max(0, Math.floor((Date.now() - original.getTime()) / 1000)));
      applyPaused(false);
      pausedElapsedRef.current = 0;
      endTimeRef.current = null;
      originalStartTimeRef.current = original;
      timelineRef.current = [{ event: "started", at: original.toISOString() }];
      // The server lock records only which side is current, not the switches
      // behind it, so an adopted session's split starts from what this device
      // can actually know: all of it on the side it's running now.
      bankedSideRef.current = NO_SIDE_SECONDS;
      // The adoption moment, not the session's start: server views requested
      // from now on will include this lock, ones from before it may not.
      claimedAtRef.current = new Date();
      resetAdjustments();
      persist({
        originalStartTimeISO: original.toISOString(),
        startTimeISO: original.toISOString(),
        pausedElapsed: 0,
        paused: false,
        pausedAtISO: null,
        activeSide: side,
        timeline: timelineRef.current,
      });
    },
    [babyId, persist, applyStartTime, applyPaused, resetAdjustments]
  );

  const handlePause = useCallback(() => {
    if (!startTime || paused || !babyId) return;
    const now = new Date();
    pausedElapsedRef.current = elapsed;
    endTimeRef.current = now;
    applyPaused(true);
    // A real pause, from the button: nothing has been cut from the end.
    trimmedRef.current = 0;
    trimPausedRef.current = false;
    if (intervalRef.current) clearInterval(intervalRef.current);
    timelineRef.current.push({ event: "paused", at: now.toISOString() });
    persist({
      originalStartTimeISO: (
        originalStartTimeRef.current || startTime
      ).toISOString(),
      startTimeISO: startTime.toISOString(),
      pausedElapsed: elapsed,
      paused: true,
      pausedAtISO: now.toISOString(),
      activeSide,
      timeline: timelineRef.current,
    });
  }, [startTime, paused, elapsed, activeSide, babyId, persist, applyPaused]);

  const handleResume = useCallback(() => {
    if (!paused || !babyId) return;
    const now = new Date();
    applyStartTime(now);
    applyPaused(false);
    endTimeRef.current = null;
    // Whatever was cut from the end is settled once the session resumes: the
    // gap from there to now is a pause like any other.
    trimmedRef.current = 0;
    trimPausedRef.current = false;
    timelineRef.current.push({ event: "resumed", at: now.toISOString() });
    persist({
      originalStartTimeISO: (originalStartTimeRef.current || now).toISOString(),
      startTimeISO: now.toISOString(),
      pausedElapsed: pausedElapsedRef.current,
      paused: false,
      pausedAtISO: null,
      activeSide,
      timeline: timelineRef.current,
    });
  }, [paused, activeSide, babyId, persist, applyStartTime, applyPaused]);

  const handleStop = useCallback(() => {
    if (!startTime || !babyId) return;
    // When paused, the activity really ended at the pause — not at the tap.
    if (!paused) endTimeRef.current = new Date();
    const stopAt = endTimeRef.current ?? new Date();
    // A pause that only exists because the end was cut isn't one anybody
    // took. The session simply ended there.
    const timeline = timelineRef.current;
    if (
      paused &&
      trimPausedRef.current &&
      timeline[timeline.length - 1]?.event === "paused"
    ) {
      timeline.pop();
    }
    timeline.push({ event: "stopped", at: stopAt.toISOString() });
    setShowComment(true);
    applyPaused(false);
    clearTimerState(type, babyId);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, [startTime, paused, type, babyId, applyPaused]);

  /**
   * Swap sides mid-feed.
   *
   * Babies routinely switch breast partway through, and the alternative —
   * finishing and starting again — splits one feed into two entries and loses
   * the real total. The elapsed time and the original start are untouched; the
   * time spent on the side being left is banked, so the saved log can say
   * "18m · 7m left, 11m right" rather than naming only whichever side it
   * happened to end on.
   *
   * No timeline event is written: the timeline is the pause/resume record the
   * history view draws, and inventing an entry for it would show a break in a
   * feed that never stopped.
   */
  const switchSide = useCallback(
    (side: "left" | "right") => {
      if (!startTime || !babyId || side === activeSide) return;
      // Close out the running side's segment before the switch takes effect:
      // resolveSideSeconds credits unaccounted time to whichever side is
      // active, so this has to be banked while that's still the old one.
      if (activeSide) {
        bankedSideRef.current = resolveSideSeconds(
          bankedSideRef.current,
          activeSide,
          elapsed
        ) ?? bankedSideRef.current;
      }
      setActiveSide(side);
      persist({
        originalStartTimeISO: (
          originalStartTimeRef.current || startTime
        ).toISOString(),
        startTimeISO: startTime.toISOString(),
        pausedElapsed: pausedElapsedRef.current,
        paused,
        pausedAtISO: paused
          ? (endTimeRef.current ?? new Date()).toISOString()
          : null,
        activeSide: side,
        timeline: timelineRef.current,
      });
    },
    [startTime, activeSide, paused, elapsed, babyId, persist]
  );

  /**
   * The -/+ buttons. See UseTimerResult.adjust for the rule; here's the why.
   *
   * Reported: a pump left running for an hour after it really ended at 5:10.
   * Taking the extra time off moved the START to 5:50 instead of pulling the
   * end back to 5:10, because minus used to mean "I tapped Start too early".
   * Forgetting Finish is the far more common slip, and correcting it must
   * leave the start alone.
   *
   * So minus first undoes any plus (a backdate that overshot), and only then
   * cuts from the end. Cutting pauses the session at its new end, because it
   * has ended: a clock that kept counting would add back what was just taken
   * off. Plus reverses the same steps in the opposite order. It gives back
   * cut time first (resuming as if nothing happened once all of it is back),
   * and only then backdates the start.
   *
   * The end can only be cut back to the last resume. Anything earlier sits on
   * the other side of a real pause, and changing that belongs to editing the
   * saved entry.
   *
   * Everything here reads refs rather than state: holding a button calls this
   * several times a second, faster than a re-render is guaranteed to land.
   */
  const adjust = useCallback(
    (deltaSeconds: number): boolean => {
      const segmentStart = startTimeRef.current;
      if (!segmentStart || !babyId || deltaSeconds === 0) return false;
      const requested = Math.abs(Math.round(deltaSeconds));
      let remaining = requested;
      let nextOriginal = originalStartTimeRef.current ?? segmentStart;
      const timeline = timelineRef.current;

      /** Move the pause marker along with the end it records. */
      const movePauseMarker = (at: Date) => {
        const last = timeline.length - 1;
        if (timeline[last]?.event === "paused") {
          timeline[last] = { event: "paused", at: at.toISOString() };
        }
      };

      /*
       * Backdating banks the extra time alongside the paused time instead of
       * moving the running segment's start, so the segment only ever measures
       * what was actually timed — which is what cutting the end relies on.
       */
      const moveStart = (seconds: number) => {
        pausedElapsedRef.current += seconds;
        backdatedRef.current += seconds;
        nextOriginal = new Date(nextOriginal.getTime() - seconds * 1000);
        if (timeline[0]?.event === "started") {
          timeline[0] = { event: "started", at: nextOriginal.toISOString() };
        }
      };

      if (deltaSeconds < 0) {
        const undo = Math.min(remaining, backdatedRef.current);
        if (undo > 0) {
          moveStart(-undo);
          remaining -= undo;
        }
        if (remaining > 0 && pausedRef.current) {
          const pausedAt = endTimeRef.current ?? new Date();
          const segment = Math.max(
            0,
            Math.floor((pausedAt.getTime() - segmentStart.getTime()) / 1000)
          );
          const cut = Math.min(remaining, segment);
          if (cut > 0) {
            const endAt = new Date(pausedAt.getTime() - cut * 1000);
            endTimeRef.current = endAt;
            pausedElapsedRef.current -= cut;
            trimmedRef.current += cut;
            movePauseMarker(endAt);
            remaining -= cut;
          }
        } else if (remaining > 0) {
          const segment = Math.max(
            0,
            Math.floor((Date.now() - segmentStart.getTime()) / 1000)
          );
          const cut = Math.min(remaining, segment);
          if (cut > 0) {
            const endAt = new Date(segmentStart.getTime() + (segment - cut) * 1000);
            pausedElapsedRef.current += segment - cut;
            endTimeRef.current = endAt;
            trimmedRef.current = cut;
            trimPausedRef.current = true;
            timeline.push({ event: "paused", at: endAt.toISOString() });
            applyPaused(true);
            if (intervalRef.current) clearInterval(intervalRef.current);
            remaining -= cut;
          }
        }
      } else {
        if (pausedRef.current && trimmedRef.current > 0) {
          const giveBack = Math.min(remaining, trimmedRef.current);
          const endAt = new Date(
            (endTimeRef.current ?? new Date()).getTime() + giveBack * 1000
          );
          endTimeRef.current = endAt;
          pausedElapsedRef.current += giveBack;
          trimmedRef.current -= giveBack;
          remaining -= giveBack;
          if (trimmedRef.current === 0 && trimPausedRef.current) {
            // All of the cut is back, so the pause it made never happened:
            // the segment picks up where it left off, still counting to now.
            pausedElapsedRef.current -= Math.round(
              (endAt.getTime() - segmentStart.getTime()) / 1000
            );
            endTimeRef.current = null;
            trimPausedRef.current = false;
            if (timeline[timeline.length - 1]?.event === "paused") timeline.pop();
            applyPaused(false);
          } else {
            movePauseMarker(endAt);
          }
        }
        if (remaining > 0) {
          moveStart(remaining);
          remaining = 0;
        }
      }

      if (remaining === requested) return false;

      originalStartTimeRef.current = nextOriginal;
      const isPaused = pausedRef.current;
      setElapsed(
        isPaused
          ? pausedElapsedRef.current
          : pausedElapsedRef.current +
              Math.floor((Date.now() - segmentStart.getTime()) / 1000)
      );
      persist({
        originalStartTimeISO: nextOriginal.toISOString(),
        startTimeISO: segmentStart.toISOString(),
        pausedElapsed: pausedElapsedRef.current,
        paused: isPaused,
        pausedAtISO: isPaused
          ? (endTimeRef.current ?? new Date()).toISOString()
          : null,
        activeSide,
        timeline,
      });
      return true;
    },
    [activeSide, babyId, persist, applyPaused]
  );

  // A diaper change is a moment: stamp start === end, then pick a status.
  const openDiaperStatus = useCallback(() => {
    const now = new Date();
    originalStartTimeRef.current = now;
    endTimeRef.current = now;
    applyStartTime(now);
    setElapsed(0);
    setShowDiaperStatus(true);
  }, [applyStartTime]);

  const markInstant = useCallback(() => {
    const now = new Date();
    originalStartTimeRef.current = now;
    endTimeRef.current = now;
    applyStartTime(now);
    setElapsed(0);
  }, [applyStartTime]);

  const handleDiaperStatusSelect = useCallback((status: string) => {
    void status; // the caller records which one
    setShowDiaperStatus(false);
    setShowComment(true);
  }, []);

  const handleCancel = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (babyId) clearTimerState(type, babyId);
    applyStartTime(null);
    setElapsed(0);
    applyPaused(false);
    pausedElapsedRef.current = 0;
    setActiveSide(null);
    setShowDiaperStatus(false);
    setShowComment(false);
    endTimeRef.current = null;
    originalStartTimeRef.current = null;
    timelineRef.current = [];
    bankedSideRef.current = NO_SIDE_SECONDS;
    claimedAtRef.current = null;
    resetAdjustments();
  }, [type, babyId, applyStartTime, applyPaused, resetAdjustments]);

  const getOriginalStartTime = useCallback(
    () => originalStartTimeRef.current,
    []
  );
  const getClaimedAt = useCallback(() => claimedAtRef.current, []);
  const getEndTime = useCallback(() => endTimeRef.current, []);
  const getTimeline = useCallback(() => timelineRef.current, []);

  // Derived rather than stored, so it stays correct through every tick,
  // pause and adjustment without any of them having to maintain it.
  const sideSeconds = resolveSideSeconds(
    bankedSideRef.current,
    activeSide,
    elapsed
  );
  const getSideSeconds = useCallback(
    () => resolveSideSeconds(bankedSideRef.current, activeSide, elapsed),
    [activeSide, elapsed]
  );
  // A single-sided feed needs no breakdown — "12m, all on the left" is just
  // the side the row already shows.
  const usedBothSides =
    !!sideSeconds && sideSeconds.left > 0 && sideSeconds.right > 0;

  // How much of the running (or last) segment the minus button could cut,
  // plus whatever backdating it would undo first — see adjust.
  const segmentSeconds = !startTime
    ? 0
    : paused
      ? Math.floor(
          ((endTimeRef.current?.getTime() ?? Date.now()) - startTime.getTime()) /
            1000
        )
      : elapsed - pausedElapsedRef.current;
  const canSubtract = backdatedRef.current > 0 || segmentSeconds >= 1;

  const isActive = !!startTime && !showComment && !showDiaperStatus;
  const isRunning = isActive && !paused;

  return {
    elapsed,
    paused,
    activeSide,
    startTime,
    isActive,
    isRunning,
    handleStart,
    adopt,
    handlePause,
    handleResume,
    handleStop,
    handleCancel,
    switchSide,
    sideSeconds,
    usedBothSides,
    getSideSeconds,
    adjust,
    canSubtract,
    showComment,
    showDiaperStatus,
    openDiaperStatus,
    handleDiaperStatusSelect,
    markInstant,
    getOriginalStartTime,
    getClaimedAt,
    getEndTime,
    getTimeline,
  };
}
