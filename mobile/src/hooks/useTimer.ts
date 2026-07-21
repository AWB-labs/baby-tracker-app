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

export interface TimerState {
  /** True start of the activity, unaffected by pauses. Saved as startTime. */
  originalStartTimeISO: string;
  /** Start of the current running segment (moves forward on every resume). */
  startTimeISO: string;
  pausedElapsed: number; // seconds accumulated before startTimeISO
  paused: boolean;
  pausedAtISO: string | null;
  activeSide: "left" | "right" | null;
  timeline: TimelineEvent[];
  babyId: number;
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
  handlePause: () => void;
  handleResume: () => void;
  handleStop: () => void; // opens the note form
  handleCancel: () => void;
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

  const persist = useCallback(
    (state: Omit<TimerState, "babyId">) => {
      if (!babyId) return;
      saveTimerState(type, babyId, { ...state, babyId });
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
  }, [type, babyId]);

  const getOriginalStartTime = useCallback(
    () => originalStartTimeRef.current,
    []
  );
  const getEndTime = useCallback(() => endTimeRef.current, []);
  const getTimeline = useCallback(() => timelineRef.current, []);

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
    handlePause,
    handleResume,
    handleStop,
    handleCancel,
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
