import { DATE_LOCALE } from "../lib/calendar";

/** Format an ISO timestamp as 12-hour time, e.g. "2:30 PM" */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Format a Date object as "YYYY-MM-DD" for native date inputs */
export function toLocalDateStr(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Format an ISO string as a date label: Today / Yesterday / "Mar 25" */
export function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(DATE_LOCALE, { month: "short", day: "numeric" });
}

/** Format an ISO string as a date label with weekday: "Mon, Mar 25" */
export function formatDateLabelLong(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(DATE_LOCALE, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * "just now" / "42m ago" / "3h ago" / "2d ago" — for snapshot and log rows.
 *
 * `asOfMs` pins the reference point somewhere other than now — the snapshot
 * cards pass a running session's start so "last feed 1h ago" holds still for
 * the whole feed instead of counting through it.
 */
export function formatRelativeTime(
  iso: string,
  asOfMs: number = Date.now()
): string {
  const diffMs = asOfMs - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const rem = mins % 60;
    return rem > 0 ? `${hours}h ${rem}m ago` : `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Format a timer in seconds as "MM:SS" */
export function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
