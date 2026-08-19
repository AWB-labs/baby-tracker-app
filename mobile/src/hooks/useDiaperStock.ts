import { useCallback, useEffect, useState } from "react";
import { fetchDiaperStock, setDiaperStock } from "../api/diaperStock";

export interface UseDiaperStockResult {
  count: number | null;
  /** Refetch without waiting for `refreshKey` to change. */
  refresh: () => Promise<void>;
  /** Hand-correct the count to an exact number; updates local state to match. */
  correct: (count: number) => Promise<number>;
}

/**
 * How many nappies are on hand — see api/src/routes/diaperStock.ts. Refetches
 * whenever `refreshKey` changes, the same shape as useMilkBalance, so a
 * caller already re-rendering on new logs can pick up a fresh count for free.
 */
export function useDiaperStock(
  babyId: number | undefined,
  refreshKey: number = 0
): UseDiaperStockResult {
  const [count, setCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (babyId == null) {
      setCount(null);
      return;
    }
    try {
      setCount(await fetchDiaperStock(babyId));
    } catch {
      // Stays as whatever it last showed rather than a broken row.
    }
  }, [babyId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const correct = useCallback(
    async (next: number) => {
      if (babyId == null) {
        throw new Error("No baby selected.");
      }
      const updated = await setDiaperStock(babyId, next);
      setCount(updated);
      return updated;
    },
    [babyId]
  );

  return { count, refresh: load, correct };
}
