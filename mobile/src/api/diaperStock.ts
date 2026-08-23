import apiClient from "./client";

export interface DiaperStock {
  count: number;
  /** The nappy size this baby is in, or null before anyone has said. */
  size: string | null;
}

export async function fetchDiaperStock(babyId: number): Promise<DiaperStock> {
  const res = await apiClient.get<DiaperStock>(
    `/babies/${babyId}/diaper-stock`
  );
  return res.data;
}

/**
 * Move the count relatively — positive to restock, negative to use one.
 *
 * `size` rides along optionally because the moment a pack of a new size is
 * opened is exactly when the size changes, and that should be one write
 * rather than two.
 */
export async function adjustDiaperStock(
  babyId: number,
  delta: number,
  size?: string
): Promise<DiaperStock> {
  const res = await apiClient.patch<DiaperStock>(
    `/babies/${babyId}/diaper-stock`,
    { delta, ...(size !== undefined ? { size } : {}) }
  );
  return res.data;
}

/** Hand-correct the count to an exact number. */
export async function setDiaperStock(
  babyId: number,
  count: number
): Promise<DiaperStock> {
  const res = await apiClient.patch<DiaperStock>(
    `/babies/${babyId}/diaper-stock`,
    { count }
  );
  return res.data;
}

/** Change the size on its own, leaving the count where it is. */
export async function setDiaperSize(
  babyId: number,
  size: string | null
): Promise<DiaperStock> {
  const res = await apiClient.patch<DiaperStock>(
    `/babies/${babyId}/diaper-stock`,
    { size }
  );
  return res.data;
}
