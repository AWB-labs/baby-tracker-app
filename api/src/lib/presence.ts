import prisma from "./prisma";

/**
 * "Active" means the account did something in the app in the last 36 hours.
 *
 * Thirty-six rather than twenty-four because of what this app is for: a parent
 * who logs the 2am feed and then the next night's 11pm one is plainly still
 * using it, and a 24-hour window would call them dormant in between. A day and
 * a half spans one skipped day without stretching so far that a genuinely
 * lapsed account looks alive.
 */
export const ACTIVE_WINDOW_HOURS = 36;

export function activeSince(now = new Date()): Date {
  return new Date(now.getTime() - ACTIVE_WINDOW_HOURS * 60 * 60 * 1000);
}

/**
 * How stale `lastSeenAt` has to be before a request bothers to rewrite it.
 *
 * The column exists so that reading counts as using the app — otherwise a
 * parent who opens the app ten times a day to check the last feed, without
 * ever writing anything, reads as dormant. But it is a heartbeat, not an audit
 * log: five-minute resolution is far finer than a 36-hour window needs, and it
 * turns a busy session's hundred requests into one write.
 */
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Stamp that this account was just seen.
 *
 * Deliberately not awaited by callers: this is telemetry sitting in front of
 * every authenticated request in the app, and no parent should wait on a round
 * trip for it. A single conditional UPDATE, with no SELECT first — the
 * staleness test rides in the WHERE clause, so an account seen a minute ago
 * costs one statement that matches no rows rather than a read plus a write.
 *
 * If it loses the race with a serverless container shutting down, nothing
 * breaks: the dashboard treats lastSeenAt as one of several candidates for
 * "last active", and any real use of the app leaves other traces with their own
 * timestamps.
 */
export function touchAccount(accountId: number): void {
  // A guard, not a formality. This is an updateMany, and Prisma treats an
  // `undefined` field in a where clause as "not filtering on it" rather than as
  // "matches nothing" — so a bad id here does not skip the write, it drops the
  // id condition and stamps every account in the table. That has happened
  // exactly once, from a token that carried no accountId, and the column is
  // cheap to defend at the door.
  if (!Number.isInteger(accountId) || accountId <= 0) return;

  const now = new Date();
  prisma.account
    .updateMany({
      where: {
        id: accountId,
        OR: [
          { lastSeenAt: null },
          { lastSeenAt: { lt: new Date(now.getTime() - HEARTBEAT_INTERVAL_MS) } },
        ],
      },
      data: { lastSeenAt: now },
    })
    .catch(() => {
      // A missed heartbeat is not worth failing, or even logging, a request the
      // parent is waiting on.
    });
}
