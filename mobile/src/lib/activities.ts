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
}

// A feed or a pump goes either way: measured in ml (no side) it is a moment;
// with a side it is timed.
export function isInstantLog(
  type: string,
  fields: InstantLogFields = {}
): boolean {
  if (INSTANT_TYPES.has(type)) return true;
  if (type !== "feed" && type !== "pump") return false;
  const { side, amountMl } = fields;
  const hasMl = amountMl !== undefined && amountMl !== null && amountMl !== "";
  return hasMl && !side;
}
