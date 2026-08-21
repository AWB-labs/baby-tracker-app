/** Number, date and label formatting. One place, so the whole dashboard agrees. */

const numberFmt = new Intl.NumberFormat(undefined);
const relativeFmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export const num = (value) => numberFmt.format(Math.round(value ?? 0));

export const decimal = (value, places = 1) =>
  (value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });

export const percent = (part, whole, places = 0) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(places)}%` : "—";

/** "3h ago", "in 2 days". Falls back to a date once it stops being useful. */
export function relative(input) {
  if (!input) return "—";
  const then = new Date(input).getTime();
  if (Number.isNaN(then)) return "—";
  const seconds = (then - Date.now()) / 1000;
  const abs = Math.abs(seconds);

  const steps = [
    [60, "second", 1],
    [3600, "minute", 60],
    [86400, "hour", 3600],
    [604800, "day", 86400],
  ];
  for (const [limit, unit, divisor] of steps) {
    if (abs < limit) return relativeFmt.format(Math.round(seconds / divisor), unit);
  }
  return dateOnly(input);
}

export const dateOnly = (input) =>
  input
    ? new Date(input).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

export const dateShort = (input) =>
  input
    ? new Date(input).toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : "—";

export const dateTime = (input) =>
  input
    ? new Date(input).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export const timeOnly = (input) =>
  input
    ? new Date(input).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : "—";

/** "1h 24m" from minutes, for durations that are sometimes very short. */
export function duration(minutes) {
  if (minutes == null) return "—";
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Elapsed time since a timestamp, for timers that are still running. */
export function elapsed(input) {
  return duration((Date.now() - new Date(input).getTime()) / 60000);
}

/** "4 months old" — the only age unit that means anything for a baby. */
export function babyAge(dob) {
  if (!dob) return null;
  const born = new Date(dob).getTime();
  if (Number.isNaN(born)) return null;
  const days = Math.floor((Date.now() - born) / 86400000);
  if (days < 0) return "not born yet";
  if (days < 14) return `${days}d old`;
  if (days < 60) return `${Math.floor(days / 7)}w old`;
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months}mo old`;
  return `${Math.floor(months / 12)}y old`;
}

/** Minutes after midnight → "09:00", for reminder schedules. */
export function timeOfDay(minutes) {
  const h = String(Math.floor((minutes ?? 0) / 60)).padStart(2, "0");
  const m = String((minutes ?? 0) % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export const titleCase = (value) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ") : "";

export const initials = (name) =>
  (name ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

/** What the "last active" timestamp is evidence of. */
export const SOURCE_LABEL = {
  log: "wrote an entry",
  timer: "ran a timer",
  seen: "opened the app",
  push: "device checked in",
  signup: "signed up",
};
