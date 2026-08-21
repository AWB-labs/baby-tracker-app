export function formatDuration(minutes: number | null): string {
  if (minutes === null || minutes === 0) return "instant";
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function formatMinutes(mins: number): string {
  if (mins === 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * "6m L · 4m R" for a feed or pump that switched breasts, or null when there
 * is no split worth showing.
 *
 * Null covers three different cases on purpose — no per-side timing recorded
 * (every entry predating the feature), and a session that only ever ran on
 * one side. In all of them the entry's own `side` already says everything a
 * breakdown would, and printing "12m L · 0m R" beside it would read as a
 * measurement rather than the absence of one.
 *
 * Always left-then-right rather than in the order they happened: only the two
 * totals are stored, so any claim about which came first would be invented.
 */
export function formatSideSplit(
  leftMinutes: number | null | undefined,
  rightMinutes: number | null | undefined
): string | null {
  if (leftMinutes == null || rightMinutes == null) return null;
  if (leftMinutes <= 0 || rightMinutes <= 0) return null;
  return `${formatDuration(leftMinutes)} L · ${formatDuration(rightMinutes)} R`;
}

export function formatGapLabel(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const days = Math.floor(h / 24);
  return `${days}d`;
}
