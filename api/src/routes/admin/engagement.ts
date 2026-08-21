import { Router, Request, Response } from "express";
import prisma from "../../lib/adminPrisma";
import { isActive, lastActivityByAccount, recentDayKeys } from "../../lib/adminMetrics";

const router = Router();

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/**
 * GET /admin/api/engagement
 *
 * The questions the raw totals don't answer: do people who sign up ever log
 * anything, do they still do it a month later, and when in the day do they do
 * it.
 *
 * The heavier shapes here — a heatmap by hour, a per-account retention grid —
 * are grouped in Postgres rather than by reading every log into memory. It
 * makes them a fixed cost instead of one that grows with the log table, which
 * is the table that grows fastest.
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const now = new Date();
  const days = Math.min(120, Math.max(7, parseInt(String(req.query.days ?? "30"), 10) || 30));
  const since = new Date(now.getTime() - days * DAY_MS);

  const [
    heatmap,
    dailyActive,
    firstLogs,
    retention,
    leaderboard,
    activity,
    accounts,
    distinctInWindowRows,
  ] = await Promise.all([
      // Day-of-week × hour, on when the activity happened rather than when it
      // was typed — a 3am feed is the point of this chart, and back-dating a
      // morning entry at noon shouldn't move it to noon.
      prisma.$queryRaw<{ dow: number; hour: number; count: number }[]>`
        SELECT EXTRACT(DOW  FROM "startTime")::int AS dow,
               EXTRACT(HOUR FROM "startTime")::int AS hour,
               COUNT(*)::int                       AS count
        FROM "ActivityLog"
        WHERE "startTime" >= ${since}
        GROUP BY 1, 2
      `,
      prisma.$queryRaw<{ day: Date; users: number; logs: number }[]>`
        SELECT date_trunc('day', "createdAt")   AS day,
               COUNT(DISTINCT "accountId")::int AS users,
               COUNT(*)::int                    AS logs
        FROM "ActivityLog"
        WHERE "createdAt" >= ${since}
        GROUP BY 1
        ORDER BY 1
      `,
      prisma.activityLog.groupBy({ by: ["accountId"], _min: { createdAt: true } }),
      // One row per (account, whole weeks since that account signed up) in
      // which the account logged something. That is the entire retention grid
      // in a single grouped scan.
      prisma.$queryRaw<{ accountId: number; weekOffset: number }[]>`
        SELECT a.id AS "accountId",
               FLOOR(EXTRACT(EPOCH FROM (l."createdAt" - a."createdAt")) / 604800)::int
                 AS "weekOffset"
        FROM "Account" a
        JOIN "ActivityLog" l ON l."accountId" = a.id
        GROUP BY 1, 2
      `,
      prisma.activityLog.groupBy({
        by: ["accountId"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        orderBy: { _count: { accountId: "desc" } },
        take: 10,
      }),
      lastActivityByAccount(),
      prisma.account.findMany({ select: { id: true, name: true, email: true, createdAt: true } }),
      prisma.$queryRaw<{ users: number }[]>`
        SELECT COUNT(DISTINCT "accountId")::int AS users
        FROM "ActivityLog"
        WHERE "createdAt" >= ${since}
      `,
    ]);

  const distinctInWindow = distinctInWindowRows[0]?.users ?? 0;

  // --- Activation: did signing up ever turn into a first entry, and how fast?
  const firstLogAt = new Map<number, Date>();
  for (const row of firstLogs) {
    if (row.accountId !== null && row._min.createdAt) {
      firstLogAt.set(row.accountId, row._min.createdAt);
    }
  }

  const latencies: number[] = [];
  let activatedWithin24h = 0;
  for (const account of accounts) {
    const first = firstLogAt.get(account.id);
    if (!first) continue;
    const hours = (first.getTime() - account.createdAt.getTime()) / 3_600_000;
    latencies.push(Math.max(0, hours));
    if (hours <= 24) activatedWithin24h += 1;
  }
  latencies.sort((a, b) => a - b);

  // --- Cohorts: everyone grouped by the week they joined.
  const weekStart = (at: Date) => {
    const utc = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
    const dow = new Date(utc).getUTCDay();
    // Monday-first, so a cohort is a working week rather than one split across
    // a weekend.
    return new Date(utc - ((dow + 6) % 7) * DAY_MS);
  };

  const weeksByAccount = new Map<number, Set<number>>();
  for (const row of retention) {
    const set = weeksByAccount.get(row.accountId) ?? new Set<number>();
    set.add(row.weekOffset);
    weeksByAccount.set(row.accountId, set);
  }

  const cohortMap = new Map<
    string,
    { size: number; activated: number; retained: number[]; stillActive: number }
  >();
  for (const account of accounts) {
    const key = weekStart(account.createdAt).toISOString().slice(0, 10);
    const cohort =
      cohortMap.get(key) ??
      { size: 0, activated: 0, retained: [0, 0, 0, 0], stillActive: 0 };
    cohort.size += 1;
    if (firstLogAt.has(account.id)) cohort.activated += 1;

    const weeks = weeksByAccount.get(account.id);
    for (let w = 0; w < 4; w++) {
      if (weeks?.has(w)) cohort.retained[w] += 1;
    }

    const entry = activity.get(account.id);
    if (entry && isActive(entry.lastActivityAt, now)) cohort.stillActive += 1;

    cohortMap.set(key, cohort);
  }

  const cohorts = [...cohortMap]
    .map(([week, c]) => ({
      week,
      // A cohort can only have had the chance to come back in week N if week N
      // has already happened for it — otherwise the newest cohort always looks
      // like a collapse.
      weeksElapsed: Math.floor((now.getTime() - new Date(week).getTime()) / WEEK_MS),
      ...c,
    }))
    .sort((a, b) => b.week.localeCompare(a.week))
    .slice(0, 10);

  // --- Daily actives, dense over the window.
  const dauByDay = new Map(
    dailyActive.map((d) => [
      new Date(d.day).toISOString().slice(0, 10),
      { users: d.users, logs: d.logs },
    ])
  );
  const daily = recentDayKeys(days, now).map((date) => ({
    date,
    users: dauByDay.get(date)?.users ?? 0,
    logs: dauByDay.get(date)?.logs ?? 0,
  }));

  const avgDau =
    daily.length > 0 ? daily.reduce((sum, d) => sum + d.users, 0) / daily.length : 0;

  const nameById = new Map(accounts.map((a) => [a.id, a]));

  res.json({
    windowDays: days,
    activation: {
      signedUp: accounts.length,
      everLogged: firstLogAt.size,
      within24h: activatedWithin24h,
      medianHoursToFirstLog:
        latencies.length > 0 ? latencies[Math.floor(latencies.length / 2)] : null,
    },
    stickiness: {
      // The usual DAU/MAU shape: how much of the month's audience shows up on
      // the average day. For a tracker whose whole job is the daily record,
      // this is the number that says whether the habit stuck.
      activeInWindow: distinctInWindow,
      avgDailyActive: avgDau,
      ratio: distinctInWindow > 0 ? avgDau / distinctInWindow : 0,
    },
    daily,
    heatmap,
    cohorts,
    leaderboard: leaderboard
      .filter((row) => row.accountId !== null)
      .map((row) => ({
        id: row.accountId,
        name: nameById.get(row.accountId!)?.name ?? "Deleted account",
        email: nameById.get(row.accountId!)?.email ?? null,
        logs: row._count._all,
      })),
  });
});

export default router;
