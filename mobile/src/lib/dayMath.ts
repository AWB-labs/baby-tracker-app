/**
 * Minutes of a log's [start, end] span that fall within the local calendar day
 * beginning at `dayStart` (local midnight). Splits an overnight log across the
 * days it actually spans, so no single day exceeds 24h of sleep/feed time.
 */
export function overlapMinutes(
  startIso: string,
  endIso: string | null,
  dayStart: Date
): number {
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const s = new Date(startIso).getTime();
  const e = endIso ? new Date(endIso).getTime() : s;
  const lo = Math.max(s, dayStart.getTime());
  const hi = Math.min(e, dayEnd.getTime());
  return Math.max(0, (hi - lo) / 60000);
}

/** Local midnight of the day an ISO timestamp falls on. */
export function localMidnight(iso: string): Date {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Whole days between two instants, by local calendar date (ignores time-of-day).
 * A sleep 11pm→7am the next morning is 1 day later; used to flag overnight logs.
 */
export function dayOffset(startIso: string, endIso: string): number {
  const sMidnight = localMidnight(startIso);
  const eMidnight = localMidnight(endIso);
  return Math.round((eMidnight.getTime() - sMidnight.getTime()) / 86400000);
}

/** "Mar 25" */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

/** "1,240 ml" */
export function formatMl(ml: number): string {
  return `${Math.round(ml).toLocaleString()} ml`;
}
