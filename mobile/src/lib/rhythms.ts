import type { LogEntry } from "../api/logs";

/**
 * When a baby usually does something, learned from their own history.
 *
 * "On average at 2pm" is not a mean you can take with arithmetic: times of day
 * are angles, and the naive average of 11pm and 1am is midday rather than
 * midnight. Everything here works on the unit circle instead, which also gives
 * a free measure of how consistent a habit is — the length of the resultant
 * vector — that decides whether we report a point ("around 2:00 PM") or a
 * window ("between 9:00 and 10:30 PM").
 */

const MINUTES_PER_DAY = 1440;
const BIN_MINUTES = 30;
const BIN_COUNT = MINUTES_PER_DAY / BIN_MINUTES;

/** Below this many distinct days a pattern is a coincidence, not a rhythm. */
export const MIN_DAYS = 3;

/** How far either side of a peak a log still counts as part of it. */
const PEAK_RADIUS_MINUTES = 90;

export interface Rhythm {
  /** Centre of the pattern, minutes after local midnight. */
  centreMinute: number;
  /** Half-width of the window, in minutes. Zero when times barely vary. */
  spreadMinutes: number;
  /** Mean duration of the logs in this cluster, or null for instant activities. */
  durationMinutes: number | null;
  /** How many logs formed it, and across how many distinct days. */
  samples: number;
  days: number;
}

function minuteOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/** Shortest signed distance from a to b on a 24h circle, in minutes. */
function circularDelta(a: number, b: number): number {
  let diff = b - a;
  while (diff > MINUTES_PER_DAY / 2) diff -= MINUTES_PER_DAY;
  while (diff < -MINUTES_PER_DAY / 2) diff += MINUTES_PER_DAY;
  return diff;
}

/**
 * Circular mean of a set of times, plus how tightly they cluster.
 *
 * `concentration` is the resultant length R in [0,1]: 1 means every log landed
 * at the same minute, 0 means they are spread evenly round the clock.
 */
function circularStats(minutes: number[]): {
  mean: number;
  concentration: number;
} {
  let x = 0;
  let y = 0;
  for (const m of minutes) {
    const angle = (2 * Math.PI * m) / MINUTES_PER_DAY;
    x += Math.cos(angle);
    y += Math.sin(angle);
  }
  x /= minutes.length;
  y /= minutes.length;
  const concentration = Math.sqrt(x * x + y * y);
  const angle = Math.atan2(y, x);
  const mean =
    (((angle / (2 * Math.PI)) * MINUTES_PER_DAY) % MINUTES_PER_DAY +
      MINUTES_PER_DAY) %
    MINUTES_PER_DAY;
  return { mean, concentration };
}

/** Circular standard deviation in minutes, from the resultant length. */
function circularSpread(concentration: number): number {
  if (concentration >= 0.9999) return 0;
  if (concentration <= 0.0001) return MINUTES_PER_DAY / 4;
  const radians = Math.sqrt(-2 * Math.log(concentration));
  return (radians / (2 * Math.PI)) * MINUTES_PER_DAY;
}

/**
 * Find the recurring times of day for one activity.
 *
 * A baby naps several times a day, so one average over every sleep would
 * describe nothing. Times are binned into half-hours round the clock, smoothed
 * so a habit straddling a bin edge isn't split in two, and each local peak is
 * treated as its own rhythm — which is what turns "sleep" into "a nap around
 * 2pm" and "bedtime around 9:30pm" rather than a meaningless midpoint.
 */
export function findRhythms(
  logs: LogEntry[],
  type: string,
  maxPatterns = 3
): Rhythm[] {
  const matching = logs.filter((l) => l.type === type);
  if (matching.length === 0) return [];

  const distinctDays = new Set(
    matching.map((l) => new Date(l.startTime).toDateString())
  ).size;
  if (distinctDays < MIN_DAYS) return [];

  const times = matching.map((l) => minuteOfDay(l.startTime));

  const bins = new Array<number>(BIN_COUNT).fill(0);
  for (const m of times) bins[Math.floor(m / BIN_MINUTES) % BIN_COUNT] += 1;

  // Circular 3-bin smoothing: a bedtime that wanders across 9:30 would
  // otherwise show as two half-height peaks instead of one real one.
  const smoothed = bins.map(
    (_, i) =>
      bins[(i - 1 + BIN_COUNT) % BIN_COUNT] + bins[i] + bins[(i + 1) % BIN_COUNT]
  );

  // A peak has to beat both its neighbours and a floor, so a single stray log
  // at 4am doesn't become "the 4am routine".
  const floor = Math.max(2, distinctDays * 0.4);
  const peaks: number[] = [];
  for (let i = 0; i < BIN_COUNT; i += 1) {
    const value = smoothed[i];
    if (value < floor) continue;
    const prev = smoothed[(i - 1 + BIN_COUNT) % BIN_COUNT];
    const next = smoothed[(i + 1) % BIN_COUNT];
    if (value >= prev && value > next) peaks.push(i);
  }
  if (peaks.length === 0) return [];

  peaks.sort((a, b) => smoothed[b] - smoothed[a]);

  const rhythms: Rhythm[] = [];
  const claimed = new Set<number>();

  for (const bin of peaks) {
    if (rhythms.length >= maxPatterns) break;
    const centre = bin * BIN_MINUTES + BIN_MINUTES / 2;

    const members: number[] = [];
    const durations: number[] = [];
    const dayKeys = new Set<string>();

    matching.forEach((log, index) => {
      if (claimed.has(index)) return;
      const m = minuteOfDay(log.startTime);
      if (Math.abs(circularDelta(centre, m)) > PEAK_RADIUS_MINUTES) return;
      claimed.add(index);
      members.push(m);
      dayKeys.add(new Date(log.startTime).toDateString());
      if (log.durationMinutes != null && log.durationMinutes > 0) {
        durations.push(log.durationMinutes);
      }
    });

    if (dayKeys.size < MIN_DAYS) continue;

    const { mean, concentration } = circularStats(members);
    rhythms.push({
      centreMinute: mean,
      spreadMinutes: circularSpread(concentration),
      durationMinutes: durations.length
        ? durations.reduce((s, d) => s + d, 0) / durations.length
        : null,
      samples: members.length,
      days: dayKeys.size,
    });
  }

  // Chronological reads like a day, which is how a parent thinks about it.
  return rhythms.sort((a, b) => a.centreMinute - b.centreMinute);
}

/** 810 -> "1:30 PM" */
export function formatClock(minutes: number): string {
  const total = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/**
 * "around 9:00 PM" or "between 9:00 and 10:30 PM".
 *
 * A window is only worth showing when the times genuinely vary; quoting a range
 * for something that happens at the same minute every day would overstate the
 * uncertainty, and quoting a single time for something that wanders by hours
 * would understate it.
 */
export function formatWindow(rhythm: Rhythm): string {
  if (rhythm.spreadMinutes < 25) return `around ${formatClock(rhythm.centreMinute)}`;
  const half = Math.min(rhythm.spreadMinutes, 180);
  return `between ${formatClock(rhythm.centreMinute - half)} and ${formatClock(
    rhythm.centreMinute + half
  )}`;
}

/** "30m" / "1h 20m" — the average length of a rhythm's sessions. */
export function formatSpan(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * The whole sentence: "Sleeps between 9:00 and 10:30 PM for about 2h".
 * Returned as parts so the screen can style the time differently from the prose.
 */
export function describeRhythm(
  verb: string,
  rhythm: Rhythm
): { lead: string; detail: string } {
  const lead = `${verb} ${formatWindow(rhythm)}`;
  const detail = rhythm.durationMinutes
    ? `for about ${formatSpan(rhythm.durationMinutes)} · ${rhythm.days} days`
    : `${rhythm.days} days`;
  return { lead, detail };
}
