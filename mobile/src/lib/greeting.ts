/**
 * Warmth, cheaply.
 *
 * The app is opened at every hour of the day and night, very often by someone
 * exhausted. A greeting that knows what time it is costs nothing and makes the
 * screen feel like it is on your side — the small-hours message in particular,
 * which is the one moment a parent most wants to feel seen.
 */
export function greetingFor(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return "Late night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Good night";
}

/**
 * A baby's age, phrased the way parents actually say it: days for the first
 * fortnight, then weeks up to about six months, then months.
 */
export function formatBabyAge(dob: string | null | undefined): string | null {
  if (!dob) return null;
  const born = new Date(dob);
  if (isNaN(born.getTime())) return null;

  const days = Math.floor((Date.now() - born.getTime()) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return "born today";
  if (days === 1) return "1 day old";
  if (days < 14) return `${days} days old`;

  const weeks = Math.floor(days / 7);
  if (weeks < 26) return weeks === 1 ? "1 week old" : `${weeks} weeks old`;

  const months = Math.floor(days / 30.44);
  if (months < 24) return months === 1 ? "1 month old" : `${months} months old`;

  const years = Math.floor(days / 365.25);
  const remainingMonths = Math.floor((days - years * 365.25) / 30.44);
  if (remainingMonths === 0) return years === 1 ? "1 year old" : `${years} years old`;
  return `${years}y ${remainingMonths}m old`;
}

/** Today's counts, for the one-line summary under the greeting. */
export interface TodaySummary {
  feeds: number;
  diapers: number;
  sleepMinutes: number;
}

export function summarise(
  logs: { type: string; startTime: string; durationMinutes: number | null }[]
): TodaySummary {
  const today = new Date().toDateString();
  let feeds = 0;
  let diapers = 0;
  let sleepMinutes = 0;
  for (const log of logs) {
    if (new Date(log.startTime).toDateString() !== today) continue;
    if (log.type === "feed") feeds += 1;
    else if (log.type === "diaper") diapers += 1;
    else if (log.type === "sleep") sleepMinutes += log.durationMinutes ?? 0;
  }
  return { feeds, diapers, sleepMinutes };
}

/** "3 feeds · 4 nappies · 5h 20m sleep", omitting anything that hasn't happened. */
export function summaryLine(summary: TodaySummary): string | null {
  const parts: string[] = [];
  if (summary.feeds > 0) {
    parts.push(`${summary.feeds} feed${summary.feeds === 1 ? "" : "s"}`);
  }
  if (summary.diapers > 0) {
    parts.push(`${summary.diapers} diaper${summary.diapers === 1 ? "" : "s"}`);
  }
  if (summary.sleepMinutes > 0) {
    const h = Math.floor(summary.sleepMinutes / 60);
    const m = Math.round(summary.sleepMinutes % 60);
    parts.push(`${h > 0 ? `${h}h ` : ""}${m > 0 ? `${m}m` : ""}`.trim() + " sleep");
  }
  return parts.length > 0 ? parts.join("  ·  ") : null;
}
