import { useCallback, useEffect, useState } from "react";
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
  const [balance, setBalance] = useState<MilkBalance | null>(null);

  const load = useCallback(async () => {
    if (babyId == null) {
      setBalance(null);
      return;
    }
    try {
      setBalance(await getMilkBalance(babyId));
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
      setBalance(next);
      return next;
    },
    [babyId]
  );

  return { balance, correct };
}
