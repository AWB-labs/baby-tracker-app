import { useCallback, useEffect, useRef, useState } from "react";
import {
  getMilkBalance,
  setMilkBalance,
  type MilkBalance,
} from "../api/logs";

export interface UseMilkBalanceResult {
  balance: MilkBalance | null;
  /** Hand-correct the balance to an exact amount; updates local state to match. */
  correct: (balanceMl: number) => Promise<MilkBalance>;
}

/**
 * The last balance each baby's fetch returned, for as long as the app runs.
 * Home can be remounted (and a fetch can fail) at any time, and without this
 * both left the card showing "—" until the next poll landed, even though
 * the real number was already known.
 */
const lastKnown = new Map<number, MilkBalance>();

/**
 * Pumped minus bottled, plus any hand correction — see api/src/routes/logs.ts.
 * Refetches whenever `refreshKey` changes, so a caller already re-rendering on
 * new logs (Home keys this on `logs.length`) picks up the new total for free.
 *
 * `babyId` is optional so this can sit alongside Home's other per-baby hooks
 * (useTimer et al.), called unconditionally before the screen's own "no baby
 * selected" guard rather than after it.
 */
export function useMilkBalance(
  babyId: number | undefined,
  refreshKey: number = 0
): UseMilkBalanceResult {
  const [balance, setBalance] = useState<MilkBalance | null>(() =>
    babyId != null ? lastKnown.get(babyId) ?? null : null
  );

  /*
   * Every fetch is numbered, and a reply only lands if nothing newer already
   * has. Home polls, refreshes on every save and on pull-to-refresh, so
   * requests overlap constantly, and without this an older reply arriving
   * last (or one for the baby just switched away from) overwrote a newer one.
   */
  const issuedRef = useRef(0);
  const appliedRef = useRef(0);
  const babyRef = useRef(babyId);
  babyRef.current = babyId;

  // Switching babies shows the new one's last known balance straight away,
  // rather than the previous baby's until the fetch comes back.
  useEffect(() => {
    setBalance(babyId != null ? lastKnown.get(babyId) ?? null : null);
  }, [babyId]);

  const load = useCallback(async () => {
    const seq = ++issuedRef.current;
    if (babyId == null) {
      setBalance(null);
      return;
    }
    try {
      const next = await getMilkBalance(babyId);
      if (seq <= appliedRef.current) return;
      lastKnown.set(babyId, next);
      if (babyRef.current !== babyId) return;
      appliedRef.current = seq;
      setBalance(next);
    } catch {
      // Stays as whatever it last showed rather than a broken row.
    }
  }, [babyId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const correct = useCallback(
    async (balanceMl: number) => {
      if (babyId == null) {
        throw new Error("No baby selected.");
      }
      const next = await setMilkBalance(babyId, balanceMl);
      // Outranks any fetch still in flight: those were asked before this
      // correction and would put the old total back.
      appliedRef.current = ++issuedRef.current;
      lastKnown.set(babyId, next);
      setBalance(next);
      return next;
    },
    [babyId]
  );

  return { balance, correct };
}
