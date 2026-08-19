import apiClient from "./client";

export async function fetchDiaperStock(babyId: number): Promise<number> {
  const res = await apiClient.get<{ count: number }>(
    `/babies/${babyId}/diaper-stock`
  );
  return res.data.count;
}

/** Move the count relatively — positive to restock, negative to use one. */
export async function adjustDiaperStock(
  babyId: number,
  delta: number
): Promise<number> {
  const res = await apiClient.patch<{ count: number }>(
    `/babies/${babyId}/diaper-stock`,
    { delta }
  );
  return res.data.count;
}

/** Hand-correct the count to an exact number. */
export async function setDiaperStock(
  babyId: number,
  count: number
): Promise<number> {
  const res = await apiClient.patch<{ count: number }>(
    `/babies/${babyId}/diaper-stock`,
    { count }
  );
  return res.data.count;
}
