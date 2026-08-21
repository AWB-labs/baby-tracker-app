import prisma from "./adminPrisma";
import { activeSince } from "./presence";

/**
 * Where an account's "last active" timestamp came from. Shown in the dashboard
 * next to the time, because the four are not equally strong evidence: a log is
 * someone using the app on purpose, a push-token refresh is barely more than
 * the phone being switched on.
 */
export type ActivitySource = "log" | "timer" | "seen" | "push" | "signup";

export interface AccountActivity {
  lastActivityAt: Date;
  source: ActivitySource;
  logCount: number;
}

/**
 * The most recent sign of life for every account, and how many logs each has
 * written.
 *
 * There is no single column to read this from, and deliberately so —
 * `lastSeenAt` only started being recorded when the dashboard was built, so on
 * its own it would report the entire existing user base as dormant. Instead
 * four independent traces are merged, newest wins:
 *
 *   log    — wrote an entry (ActivityLog.createdAt, not startTime: a feed can
 *            be back-dated to this morning while the person typing it is here
 *            now, and it is the typing that makes them active)
 *   timer  — has a running timer, or last touched one (ActiveTimer.updatedAt)
 *   seen   — made any authenticated request (Account.lastSeenAt)
 *   push   — the app registered or refreshed a notification token
 *
 * Signing up is itself using the app, so an account with no other trace falls
 * back to its own createdAt rather than to nothing.
 *
 * Four grouped queries plus one account read, whatever the user count — this
 * stays a fixed five round trips rather than one per account.
 */
export async function lastActivityByAccount(): Promise<Map<number, AccountActivity>> {
  const [accounts, logs, timers, pushes] = await Promise.all([
    prisma.account.findMany({ select: { id: true, createdAt: true, lastSeenAt: true } }),
    prisma.activityLog.groupBy({
      by: ["accountId"],
      _max: { createdAt: true },
      _count: { _all: true },
    }),
    prisma.activeTimer.groupBy({ by: ["accountId"], _max: { updatedAt: true } }),
    prisma.pushToken.groupBy({ by: ["accountId"], _max: { updatedAt: true } }),
  ]);

  const map = new Map<number, AccountActivity>();

  for (const account of accounts) {
    map.set(account.id, {
      lastActivityAt: account.createdAt,
      source: "signup",
      logCount: 0,
    });
    if (account.lastSeenAt) {
      consider(map, account.id, account.lastSeenAt, "seen");
    }
  }

  for (const row of logs) {
    // Nullable: a deleted caregiver leaves their entries behind with the author
    // cleared. Those logs belong to no account, so they contribute to no one's
    // activity — they are still counted in the global totals elsewhere.
    if (row.accountId === null) continue;
    const entry = map.get(row.accountId);
    if (entry) entry.logCount = row._count._all;
    if (row._max.createdAt) consider(map, row.accountId, row._max.createdAt, "log");
  }

  for (const row of timers) {
    if (row.accountId === null || !row._max.updatedAt) continue;
    consider(map, row.accountId, row._max.updatedAt, "timer");
  }

  for (const row of pushes) {
    if (!row._max.updatedAt) continue;
    consider(map, row.accountId, row._max.updatedAt, "push");
  }

  return map;
}

function consider(
  map: Map<number, AccountActivity>,
  accountId: number,
  at: Date,
  source: ActivitySource
): void {
  const entry = map.get(accountId);
  if (!entry) return;
  if (at.getTime() > entry.lastActivityAt.getTime()) {
    entry.lastActivityAt = at;
    entry.source = source;
  }
}

export function isActive(at: Date, now = new Date()): boolean {
  return at.getTime() >= activeSince(now).getTime();
}

/** Midnight UTC of the day `at` falls in, as an ISO date string. */
export function dayKey(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** The last `days` day-keys, oldest first, ending with today. */
export function recentDayKeys(days: number, now = new Date()): string[] {
  const keys: string[] = [];
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let i = days - 1; i >= 0; i--) {
    keys.push(new Date(start - i * 86_400_000).toISOString().slice(0, 10));
  }
  return keys;
}

/**
 * Bucket timestamps into a dense daily series — every day in the range present,
 * zeroes included, so a chart doesn't have to invent the gaps.
 */
export function countByDay(
  timestamps: Date[],
  days: number,
  now = new Date()
): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const key of recentDayKeys(days, now)) counts.set(key, 0);
  for (const at of timestamps) {
    const key = dayKey(at);
    const current = counts.get(key);
    if (current !== undefined) counts.set(key, current + 1);
  }
  return [...counts].map(([date, count]) => ({ date, count }));
}
