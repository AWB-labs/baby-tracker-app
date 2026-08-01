// An activity is either a span of time (a sleep, a nursing feed) or a single
// moment (a shower, a vitamin, a diaper change). Instant activities are
// counted, never timed: they store endTime === startTime, carry no duration,
// and render as one time. Cards, the manual-entry sheet and the edit modal all
// derive their behaviour from this list, so a type is only declared once.
// Mirrors api/src/lib/activities.ts.
const INSTANT_TYPES: ReadonlySet<string> = new Set([
  "diaper",
  "shower",
  "vitamin",
  "nailcut",
  "growth",
  "health",
  // A family-invented habit, and the once-a-day ones from the catalogue. These
  // had been added to the server's list without being mirrored here, so a bath
  // or a tummy-time entry was drawn as a timed span and given a duration pill
  // for a session that never had one.
  "habit",
  "tummy",
  "sunlight",
  "bath",
  "massage",
  "teeth",
  "walk",
  "medicine",
]);

interface InstantLogFields {
  side?: string | null;
  amountMl?: number | string | null;
  /**
   * The real times, when they're known. A bottle can now be either an
   * instant volume log or a timed session (started the same way as
   * breastfeeding, just with no side), so when both times are on hand
   * they're checked directly instead of guessed at — the side/amount guess
   * below only stands in for a form that has no record yet to check, e.g.
   * while a manual entry is still being filled out.
   */
  startTime?: Date | string | null;
  endTime?: Date | string | null;
}

// A feed or a pump goes either way: measured in ml (no side) it is usually a
// moment, but with matching start/end times rather than differing ones it is
// timed — same as breastfeeding, just without a side to switch between.
export function isInstantLog(
  type: string,
  fields: InstantLogFields = {}
): boolean {
  if (INSTANT_TYPES.has(type)) return true;
  if (type !== "feed" && type !== "pump") return false;
  const { side, amountMl, startTime, endTime } = fields;
  if (startTime != null && endTime != null) {
    return new Date(startTime).getTime() === new Date(endTime).getTime();
  }
  const hasMl = amountMl !== undefined && amountMl !== null && amountMl !== "";
  return hasMl && !side;
}
