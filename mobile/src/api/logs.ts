import apiClient from "./client";

export type TimelineEvent = {
  event: "started" | "paused" | "resumed" | "stopped";
  at: string;
};

export interface LogEntry {
  id: number;
  type: string;
  side: string | null;
  amountMl: number | null;
  diaperStatus: string | null;
  weightKg: number | null;
  heightCm: number | null;
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
}

export async function fetchLogs(
  babyId: number,
  limit: number | "all" = 200
): Promise<LogEntry[]> {
  const res = await apiClient.get<LogEntry[]>("/logs", {
    params: { babyId, limit },
  });
  return res.data;
}

export interface CreateLogInput {
  babyId: number;
  type: string;
  side?: string | null;
  amountMl?: number | null;
  diaperStatus?: string | null;
  weightKg?: number | null;
  heightCm?: number | null;
  healthCondition?: string | null;
  medication?: string | null;
  dose?: string | null;
  feverCelsius?: number | null;
  startTime: string;
  endTime?: string | null;
  comments?: string | null;
  enteredByName: string;
  pauseTimeline?: TimelineEvent[] | null;
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
  weightKg?: number | null;
  heightCm?: number | null;
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
