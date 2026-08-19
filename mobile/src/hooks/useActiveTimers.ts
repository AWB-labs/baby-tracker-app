import { useCallback, useEffect, useState } from "react";
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
  /** Someone else's running feed/pump/sleep for this baby, by type. */
  activeByType: Partial<Record<TimerType, ActiveTimerRecord>>;
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

  const refresh = useCallback(async () => {
    if (babyId == null) {
      setActiveByType({});
      return;
    }
    try {
      const timers = await fetchActiveTimers(babyId);
      const byType: Partial<Record<TimerType, ActiveTimerRecord>> = {};
      for (const timer of timers) byType[timer.type] = timer;
      setActiveByType(byType);
    } catch {
      // Stays as whatever it last showed rather than flashing every card back
      // to idle on a dropped request.
    }
  }, [babyId]);

  useEffect(() => {
    setActiveByType({});
    refresh();
  }, [refresh]);

  usePolling(refresh, POLL_INTERVAL_MS);

  return { activeByType, refresh };
}
