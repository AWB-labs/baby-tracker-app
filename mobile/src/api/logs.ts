import apiClient from "./client";

export type TimelineEvent = {
  event: "started" | "paused" | "resumed" | "stopped";
  at: string;
};

export interface LogEntry {
  id: number;
  type: string;
  side: string | null;
  /**
   * Minutes on each breast, when a feed or pump switched sides mid session.
   * Both null when it stayed on one side, and on entries predating per-side
   * timing — "no split" means unknown, never zero.
   */
  leftMinutes: number | null;
  rightMinutes: number | null;
  amountMl: number | null;
  diaperStatus: string | null;
  /** Whether this change drew one from diaper stock when it was logged —
   *  false on entries predating this flag, even if they actually did. */
  diaperStockUsed: boolean;
  /** "nap" | "night" on a sleep. Null elsewhere, and on sleeps predating it. */
  sleepKind: string | null;
  weightKg: number | null;
  heightCm: number | null;
  headCircumferenceCm: number | null;
  healthCondition: string | null;
  medication: string | null;
  dose: string | null;
  feverCelsius: number | null;
  startTime: string;
  endTime: string | null;
  durationMinutes: number | null;
  comments: string | null;
  enteredByName: string;
  pauseTimelineJson: string | null;
  createdAt: string;
  /**
   * Client-only, on a meal shown in the Activity timeline (type "food"):
   * meals live in their own table, so the screen folds them in as entries
   * like this. `mealTitle` names it, `mealFoods` lists what was in it.
   */
  mealTitle?: string;
  mealFoods?: string;
}

export interface FetchLogsOptions {
  /** Only this activity type. Filtering on the server, not after the fact. */
  type?: string | null;
  /**
   * Id of the last entry already held; the next page starts after it. Keyset
   * rather than offset, so paging stays cheap however deep you scroll and
   * doesn't shuffle when someone logs an entry while you're reading.
   */
  cursor?: number | null;
}

export async function fetchLogs(
  babyId: number,
  limit: number | "all" = 200,
  options: FetchLogsOptions = {}
): Promise<LogEntry[]> {
  const res = await apiClient.get<LogEntry[]>("/logs", {
    params: {
      babyId,
      limit,
      ...(options.type ? { type: options.type } : {}),
      ...(options.cursor ? { cursor: options.cursor } : {}),
    },
  });
  return res.data;
}

export interface CreateLogInput {
  babyId: number;
  type: string;
  side?: string | null;
  leftMinutes?: number | null;
  rightMinutes?: number | null;
  amountMl?: number | null;
  diaperStatus?: string | null;
  /** Whether this change draws one from diaper stock — diaper logs only. */
  diaperStockUsed?: boolean;
  sleepKind?: "nap" | "night" | null;
  weightKg?: number | null;
  heightCm?: number | null;
  headCircumferenceCm?: number | null;
  healthCondition?: string | null;
  medication?: string | null;
  dose?: string | null;
  feverCelsius?: number | null;
  startTime: string;
  endTime?: string | null;
  comments?: string | null;
  enteredByName: string;
  pauseTimeline?: TimelineEvent[] | null;
  /**
   * Finish the running feed/pump/sleep lock for this baby as part of saving
   * this entry, instead of in a second request that can be lost on its own.
   * Only the screen that owns the timer should set it — see the note on the
   * server's own `releaseTimer`.
   */
  releaseTimer?: boolean;
}

export async function createLog(data: CreateLogInput): Promise<LogEntry> {
  const res = await apiClient.post<LogEntry>("/logs", data);
  return res.data;
}

/** Fields a log can be edited with. Omitted keys are left untouched. */
export interface UpdateLogInput {
  side?: string | null;
  amountMl?: number | null;
  diaperStatus?: string | null;
  sleepKind?: "nap" | "night" | null;
  weightKg?: number | null;
  heightCm?: number | null;
  headCircumferenceCm?: number | null;
  healthCondition?: string | null;
  medication?: string | null;
  dose?: string | null;
  feverCelsius?: number | null;
  startTime?: string;
  endTime?: string | null;
  comments?: string | null;
}

export async function updateLog(
  id: number,
  data: UpdateLogInput
): Promise<LogEntry> {
  const res = await apiClient.patch<LogEntry>(`/logs/${id}`, data);
  return res.data;
}

export async function deleteLog(id: number): Promise<void> {
  await apiClient.delete(`/logs/${id}`);
}

export interface MilkBalance {
  pumpedMl: number;
  bottleMl: number;
  balanceMl: number;
}

export async function getMilkBalance(babyId: number): Promise<MilkBalance> {
  const res = await apiClient.get<MilkBalance>("/logs/milk-balance", {
    params: { babyId },
  });
  return res.data;
}

/** Hand-correct the balance to an exact amount — the server works out what
 *  offset that takes so future pumps/bottles keep moving it from there. */
export async function setMilkBalance(
  babyId: number,
  balanceMl: number
): Promise<MilkBalance> {
  const res = await apiClient.patch<MilkBalance>("/logs/milk-balance", {
    babyId,
    balanceMl,
  });
  return res.data;
}
