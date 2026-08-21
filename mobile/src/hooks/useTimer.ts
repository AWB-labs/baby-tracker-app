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
  /** Nudge the start earlier (positive) or later (negative), in seconds. */
  adjustStart: (deltaSeconds: number) => void;
  showComment: boolean;
  showDiaperStatus: boolean;
  openDiaperStatus: () => void;
  handleDiaperStatusSelect: (status: string) => void;
  /** Begin an instant log that still needs a follow-up form (start === end). */
  markInstant: () => void;
  /** True start of the activity, for the saved log. */
  getOriginalStartTime: () => Date | null;
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

  // Restore persisted state on mount / babyId change
  useEffect(() => {
    if (!babyId) return;
    restoredRef.current = false;
    setStartTime(null);
    setElapsed(0);
    setPaused(false);
    setActiveSide(null);
    setShowComment(false);
    setShowDiaperStatus(false);
    pausedElapsedRef.current = 0;
    endTimeRef.current = null;
    originalStartTimeRef.current = null;
    timelineRef.current = [];
    bankedSideRef.current = NO_SIDE_SECONDS;

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
      setPaused(saved.paused);
      setStartTime(restored);
      originalStartTimeRef.current = originalStart;
      timelineRef.current = Array.isArray(saved.timeline) ? saved.timeline : [];
      // Absent on a session started before per-side timing shipped; zero is
      // right for it either way, since nothing was ever banked.
      bankedSideRef.current = saved.sideSeconds ?? NO_SIDE_SECONDS;
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
  }, [type, babyId]);

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
    (state: Omit<TimerState, "babyId" | "sideSeconds">) => {
      if (!babyId) return;
      saveTimerState(type, babyId, {
        ...state,
        sideSeconds: bankedSideRef.current,
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
      setStartTime(now);
      setElapsed(0);
      setPaused(false);
      pausedElapsedRef.current = 0;
      endTimeRef.current = null;
      originalStartTimeRef.current = now;
      timelineRef.current = [{ event: "started", at: now.toISOString() }];
      bankedSideRef.current = NO_SIDE_SECONDS;
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
    [babyId, persist]
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
      setStartTime(original);
      setElapsed(Math.max(0, Math.floor((Date.now() - original.getTime()) / 1000)));
      setPaused(false);
      pausedElapsedRef.current = 0;
      endTimeRef.current = null;
      originalStartTimeRef.current = original;
      timelineRef.current = [{ event: "started", at: original.toISOString() }];
      // The server lock records only which side is current, not the switches
      // behind it, so an adopted session's split starts from what this device
      // can actually know: all of it on the side it's running now.
      bankedSideRef.current = NO_SIDE_SECONDS;
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
    [babyId, persist]
  );

  const handlePause = useCallback(() => {
    if (!startTime || paused || !babyId) return;
    const now = new Date();
    pausedElapsedRef.current = elapsed;
    endTimeRef.current = now;
    setPaused(true);
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
  }, [startTime, paused, elapsed, activeSide, babyId, persist]);

  const handleResume = useCallback(() => {
    if (!paused || !babyId) return;
    const now = new Date();
    setStartTime(now);
    setPaused(false);
    endTimeRef.current = null;
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
  }, [paused, activeSide, babyId, persist]);

  const handleStop = useCallback(() => {
    if (!startTime || !babyId) return;
    // When paused, the activity really ended at the pause — not at the tap.
    if (!paused) endTimeRef.current = new Date();
    const stopAt = endTimeRef.current ?? new Date();
    timelineRef.current.push({ event: "stopped", at: stopAt.toISOString() });
    setShowComment(true);
    setPaused(false);
    clearTimerState(type, babyId);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, [startTime, paused, type, babyId]);

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

  // Nudge the running/paused timer's start by deltaSeconds (positive = earlier,
  // i.e. "add" elapsed; negative = later, i.e. "subtract"). Lets a late tap be
  // backdated — e.g. baby fell asleep 10 min ago. Clamped so elapsed can't go
  // below 0 (the start can't pass "now").
  const adjustStart = useCallback(
    (deltaSeconds: number) => {
      if (!startTime || !babyId) return;
      const original = originalStartTimeRef.current || startTime;

      if (paused) {
        // Paused: elapsed is frozen in pausedElapsedRef. Shift it directly,
        // clamped at 0, and move the saved start to match.
        const nextElapsed = Math.max(0, pausedElapsedRef.current + deltaSeconds);
        const applied = nextElapsed - pausedElapsedRef.current;
        if (applied === 0) return;
        pausedElapsedRef.current = nextElapsed;
        setElapsed(nextElapsed);
        const nextOriginal = new Date(original.getTime() - applied * 1000);
        originalStartTimeRef.current = nextOriginal;
        persist({
          originalStartTimeISO: nextOriginal.toISOString(),
          startTimeISO: startTime.toISOString(),
          pausedElapsed: nextElapsed,
          paused: true,
          pausedAtISO: (endTimeRef.current ?? new Date()).toISOString(),
          activeSide,
          timeline: timelineRef.current,
        });
        return;
      }

      // Running: total elapsed = pausedElapsed + (now - startTime). Shift both
      // the running segment start and the saved original by the same amount,
      // clamping so the total can't drop below 0.
      const currentElapsed =
        pausedElapsedRef.current +
        Math.floor((Date.now() - startTime.getTime()) / 1000);
      const applied =
        Math.max(0, currentElapsed + deltaSeconds) - currentElapsed;
      if (applied === 0) return;
      const nextStart = new Date(startTime.getTime() - applied * 1000);
      const nextOriginal = new Date(original.getTime() - applied * 1000);
      setStartTime(nextStart);
      originalStartTimeRef.current = nextOriginal;
      setElapsed(
        pausedElapsedRef.current +
          Math.floor((Date.now() - nextStart.getTime()) / 1000)
      );
      persist({
        originalStartTimeISO: nextOriginal.toISOString(),
        startTimeISO: nextStart.toISOString(),
        pausedElapsed: pausedElapsedRef.current,
        paused: false,
        pausedAtISO: null,
        activeSide,
        timeline: timelineRef.current,
      });
    },
    [startTime, paused, activeSide, babyId, persist]
  );

  // A diaper change is a moment: stamp start === end, then pick a status.
  const openDiaperStatus = useCallback(() => {
    const now = new Date();
    originalStartTimeRef.current = now;
    endTimeRef.current = now;
    setStartTime(now);
    setElapsed(0);
    setShowDiaperStatus(true);
  }, []);

  const markInstant = useCallback(() => {
    const now = new Date();
    originalStartTimeRef.current = now;
    endTimeRef.current = now;
    setStartTime(now);
    setElapsed(0);
  }, []);

  const handleDiaperStatusSelect = useCallback((status: string) => {
    void status; // the caller records which one
    setShowDiaperStatus(false);
    setShowComment(true);
  }, []);

  const handleCancel = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (babyId) clearTimerState(type, babyId);
    setStartTime(null);
    setElapsed(0);
    setPaused(false);
    pausedElapsedRef.current = 0;
    setActiveSide(null);
    setShowDiaperStatus(false);
    setShowComment(false);
    endTimeRef.current = null;
    originalStartTimeRef.current = null;
    timelineRef.current = [];
    bankedSideRef.current = NO_SIDE_SECONDS;
  }, [type, babyId]);

  const getOriginalStartTime = useCallback(
    () => originalStartTimeRef.current,
    []
  );
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
    adjustStart,
    showComment,
    showDiaperStatus,
    openDiaperStatus,
    handleDiaperStatusSelect,
    markInstant,
    getOriginalStartTime,
    getEndTime,
    getTimeline,
  };
}
