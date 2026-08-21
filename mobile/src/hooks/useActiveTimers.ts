import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchActiveTimers,
  type ActiveTimerRecord,
  type TimerType,
} from "../api/activeTimers";
import { usePolling } from "./usePolling";

/**
 * Slow enough to be cheap, fast enough that a caregiver reaching for "Start
 * feeding" sees someone else already has it before they tap it — see
 * usePolling for why this is gated on the app being foregrounded and this
 * tab being on screen.
 */
const POLL_INTERVAL_MS = 20_000;

export interface UseActiveTimersResult {
  /** Someone's running feed/pump/sleep for this baby, by type. */
  activeByType: Partial<Record<TimerType, ActiveTimerRecord>>;
  /**
   * When the request behind the current `activeByType` was *sent*, in ms
   * epoch — null until the first fetch for this baby resolves. Sent, not
   * received: consumers compare it against a local timer's start time to
   * decide whether this view is recent enough to say "your session's lock
   * is gone", and a response can only vouch for the moment it was asked.
   */
  syncedAt: number | null;
  refresh: () => Promise<void>;
}

/**
 * Who — if anyone — currently has a feed, pump or sleep timer running for this
 * baby, from any caregiver's device. Polled rather than pushed: the app has no
 * realtime channel, and a caregiver about to start the same activity only
 * needs to know within a few seconds, not instantly.
 */
export function useActiveTimers(
  babyId: number | undefined
): UseActiveTimersResult {
  const [activeByType, setActiveByType] = useState<
    Partial<Record<TimerType, ActiveTimerRecord>>
  >({});
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  /**
   * Monotonic id per fetch, so only the latest-initiated request may write
   * state. Without it, the 20s poll and the refetch after finishing a
   * session can overlap, and a response that left *before* the lock was
   * released can land *after* the fresh one — putting the dead lock back
   * into state, where the adopt logic (local timer just cleared) reads it
   * as an unfinished session and restarts the clock that was just saved.
   */
  const fetchSeqRef = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    const requestedAt = Date.now();
    if (babyId == null) {
      setActiveByType({});
      setSyncedAt(null);
      return;
    }
    try {
      const timers = await fetchActiveTimers(babyId);
      if (seq !== fetchSeqRef.current) return; // superseded — discard
      const byType: Partial<Record<TimerType, ActiveTimerRecord>> = {};
      for (const timer of timers) byType[timer.type] = timer;
      setActiveByType(byType);
      setSyncedAt(requestedAt);
    } catch {
      // Stays as whatever it last showed rather than flashing every card back
      // to idle on a dropped request.
    }
  }, [babyId]);

  useEffect(() => {
    // Invalidate anything in flight for the previous baby, so its late
    // response can't land on this one's state.
    fetchSeqRef.current += 1;
    setActiveByType({});
    setSyncedAt(null);
    refresh();
  }, [refresh]);

  usePolling(refresh, POLL_INTERVAL_MS);

  return { activeByType, syncedAt, refresh };
}
