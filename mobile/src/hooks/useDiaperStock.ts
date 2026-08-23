import { useCallback, useEffect, useState } from "react";
import {
  adjustDiaperStock,
  fetchDiaperStock,
  setDiaperSize,
  setDiaperStock,
  type DiaperStock,
} from "../api/diaperStock";

export interface UseDiaperStockResult {
  count: number | null;
  /** The nappy size this baby is in, or null before anyone has said. */
  size: string | null;
  /** Refetch without waiting for `refreshKey` to change. */
  refresh: () => Promise<void>;
  /** Hand-correct the count to an exact number; updates local state to match. */
  correct: (count: number) => Promise<number>;
  /**
   * Move the count relatively. Preferred over `correct` for "used one" and
   * "bought a pack": the server applies the delta to whatever it holds, so
   * two caregivers doing this at the same time both land, where two exact
   * counts would have one silently overwrite the other.
   *
   * `size` rides along when the pack being added is a new size.
   */
  adjust: (delta: number, size?: string) => Promise<number>;
  /** Change the size without touching the count. */
  changeSize: (size: string | null) => Promise<void>;
}

/**
 * How many nappies are on hand, and which size — see
 * api/src/routes/diaperStock.ts. Refetches whenever `refreshKey` changes, the
 * same shape as useMilkBalance, so a caller already re-rendering on new logs
 * can pick up a fresh count for free.
 */
export function useDiaperStock(
  babyId: number | undefined,
  refreshKey: number = 0
): UseDiaperStockResult {
  const [count, setCount] = useState<number | null>(null);
  const [size, setSize] = useState<string | null>(null);

  /** One place to fold a server reply back into both pieces of state. */
  const apply = useCallback((stock: DiaperStock) => {
    setCount(stock.count);
    setSize(stock.size);
    return stock.count;
  }, []);

  const load = useCallback(async () => {
    if (babyId == null) {
      setCount(null);
      setSize(null);
      return;
    }
    try {
      apply(await fetchDiaperStock(babyId));
    } catch {
      // Stays as whatever it last showed rather than a broken row.
    }
  }, [babyId, apply]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const correct = useCallback(
    async (next: number) => {
      if (babyId == null) {
        throw new Error("No baby selected.");
      }
      return apply(await setDiaperStock(babyId, next));
    },
    [babyId, apply]
  );

  const adjust = useCallback(
    async (delta: number, nextSize?: string) => {
      if (babyId == null) {
        throw new Error("No baby selected.");
      }
      return apply(await adjustDiaperStock(babyId, delta, nextSize));
    },
    [babyId, apply]
  );

  const changeSize = useCallback(
    async (nextSize: string | null) => {
      if (babyId == null) {
        throw new Error("No baby selected.");
      }
      apply(await setDiaperSize(babyId, nextSize));
    },
    [babyId, apply]
  );

  return { count, size, refresh: load, correct, adjust, changeSize };
}
