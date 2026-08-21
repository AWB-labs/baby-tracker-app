import { Router, Response } from "express";
import prisma from "../../lib/adminPrisma";
import { ACTIVE_WINDOW_HOURS, activeSince } from "../../lib/presence";
import {
  countByDay,
  isActive,
  lastActivityByAccount,
} from "../../lib/adminMetrics";

const router = Router();

const DAY_MS = 86_400_000;

// GET /admin/api/overview
router.get("/", async (_req, res: Response): Promise<void> => {
  const now = new Date();
  const since24h = new Date(now.getTime() - DAY_MS);
  const since7d = new Date(now.getTime() - 7 * DAY_MS);
  const since30d = new Date(now.getTime() - 30 * DAY_MS);
  // The series needs the whole day 29 days ago, not the moment 30 × 24 hours
  // ago, or its first bucket is a part-day that reads as a slump.
  const seriesFrom = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 29 * DAY_MS
  );

  const [
    totalUsers,
    newUsers7d,
    newUsers30d,
    totalBabies,
    newBabies7d,
    totalLogs,
    logs24h,
    logs7d,
    logs30d,
    liveTimers,
    logTypes,
    signupTimestamps,
    logTimestamps,
    membershipCounts,
    pushPlatforms,
    pendingInvites,
    activity,
  ] = await Promise.all([
    prisma.account.count(),
    prisma.account.count({ where: { createdAt: { gte: since7d } } }),
    prisma.account.count({ where: { createdAt: { gte: since30d } } }),
    prisma.baby.count(),
    prisma.baby.count({ where: { createdAt: { gte: since7d } } }),
    prisma.activityLog.count(),
    prisma.activityLog.count({ where: { createdAt: { gte: since24h } } }),
    prisma.activityLog.count({ where: { createdAt: { gte: since7d } } }),
    prisma.activityLog.count({ where: { createdAt: { gte: since30d } } }),
    prisma.activeTimer.count(),
    prisma.activityLog.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.account.findMany({
      where: { createdAt: { gte: seriesFrom } },
      select: { createdAt: true },
    }),
    prisma.activityLog.findMany({
      where: { createdAt: { gte: seriesFrom } },
      select: { createdAt: true },
    }),
    // How many caregivers each baby has — the sharing rate, which is the whole
    // point of the invite system and the one number that says whether it landed.
    prisma.babyMember.groupBy({ by: ["babyId"], _count: { _all: true } }),
    prisma.pushToken.groupBy({ by: ["platform"], _count: { _all: true } }),
    prisma.babyInvite.count(),
    lastActivityByAccount(),
  ]);

  let activeUsers = 0;
  for (const entry of activity.values()) {
    if (isActive(entry.lastActivityAt, now)) activeUsers += 1;
  }

  const sharedBabies = membershipCounts.filter((m) => m._count._all > 1).length;

  res.json({
    generatedAt: now.toISOString(),
    activeWindowHours: ACTIVE_WINDOW_HOURS,
    activeSince: activeSince(now).toISOString(),
    users: {
      total: totalUsers,
      new7d: newUsers7d,
      new30d: newUsers30d,
      active: activeUsers,
      dormant: totalUsers - activeUsers,
    },
    babies: {
      total: totalBabies,
      new7d: newBabies7d,
      shared: sharedBabies,
      solo: totalBabies - sharedBabies,
      pendingInvites,
    },
    logs: {
      total: totalLogs,
      last24h: logs24h,
      last7d: logs7d,
      last30d: logs30d,
      perUser: totalUsers ? totalLogs / totalUsers : 0,
      perBaby: totalBabies ? totalLogs / totalBabies : 0,
    },
    liveTimers,
    series: {
      signups: countByDay(
        signupTimestamps.map((s) => s.createdAt),
        30,
        now
      ),
      logs: countByDay(
        logTimestamps.map((l) => l.createdAt),
        30,
        now
      ),
    },
    logTypes: logTypes
      .map((t) => ({ key: t.type, count: t._count._all }))
      .sort((a, b) => b.count - a.count),
    pushPlatforms: pushPlatforms
      .map((p) => ({ key: p.platform ?? "unknown", count: p._count._all }))
      .sort((a, b) => b.count - a.count),
  });
});

export default router;
