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
