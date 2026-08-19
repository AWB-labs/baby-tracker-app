import apiClient from "./client";

export type TimerType = "feed" | "pump" | "sleep";

/** A timed activity someone is currently running for a baby, server-side. */
export interface ActiveTimerRecord {
  id: number;
  babyId: number;
  type: TimerType;
  accountId: number | null;
  enteredByName: string;
  startTime: string;
  side: "left" | "right" | null;
  updatedAt: string;
}

export async function fetchActiveTimers(
  babyId: number
): Promise<ActiveTimerRecord[]> {
  const res = await apiClient.get<ActiveTimerRecord[]>("/active-timers", {
    params: { babyId },
  });
  return res.data;
}

export interface StartActiveTimerInput {
  babyId: number;
  type: TimerType;
  side?: "left" | "right" | null;
  startTime: string;
  enteredByName: string;
}

/** Thrown when someone else already holds the lock for this activity. */
export class TimerConflictError extends Error {
  timer: ActiveTimerRecord | null;
  constructor(timer: ActiveTimerRecord | null) {
    super("That activity is already running.");
    this.name = "TimerConflictError";
    this.timer = timer;
  }
}

/** Claim the lock for a feed/pump/sleep. Throws TimerConflictError if someone
 *  else already holds it — callers should check for that before falling back
 *  to a generic error toast. */
export async function startActiveTimer(
  data: StartActiveTimerInput
): Promise<ActiveTimerRecord> {
  try {
    const res = await apiClient.post<ActiveTimerRecord>("/active-timers", data);
    return res.data;
  } catch (err) {
    const response = (
      err as { response?: { status?: number; data?: { timer?: ActiveTimerRecord } } }
    ).response;
    if (response?.status === 409) {
      throw new TimerConflictError(response.data?.timer ?? null);
    }
    throw err;
  }
}

/** Release the lock. Safe to call even if it's already gone. */
export async function endActiveTimer(
  babyId: number,
  type: TimerType
): Promise<void> {
  await apiClient.delete("/active-timers", { params: { babyId, type } });
}
