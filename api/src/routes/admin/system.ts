import { Router, Response } from "express";
import prisma from "../../lib/adminPrisma";

const router = Router();

/**
 * GET /admin/api/system
 *
 * The service's own housekeeping rather than its users: which features are
 * actually switched on, what is sitting unclaimed, and whether anything is in
 * a state that needs a person to look at it.
 */
router.get("/", async (_req, res: Response): Promise<void> => {
  const now = new Date();

  const [
    invites,
    reminderTypes,
    remindersEnabled,
    remindersDisabled,
    pushPlatforms,
    unitSystems,
    notificationsOn,
    themeColors,
    orphanLogs,
    outstandingResets,
    expiredResets,
    profiles,
    vaccinesGiven,
    vaccineRows,
    bagItems,
    bagChecked,
    staleTimers,
    accountsSeen,
    totalAccounts,
  ] = await Promise.all([
    prisma.babyInvite.findMany({
      select: { token: true, expiresAt: true, createdAt: true },
    }),
    prisma.reminder.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.reminder.count({ where: { enabled: true } }),
    prisma.reminder.count({ where: { enabled: false } }),
    prisma.pushToken.groupBy({ by: ["platform"], _count: { _all: true } }),
    prisma.account.groupBy({ by: ["unitSystem"], _count: { _all: true } }),
    prisma.account.count({ where: { notificationsEnabled: true } }),
    prisma.account.count({ where: { themeColor: { not: null } } }),
    // Entries whose author deleted their account. Not a fault — ActivityLog's
    // author relation is SetNull precisely so a family's history survives one
    // caregiver leaving — but worth being able to see the size of.
    prisma.activityLog.count({ where: { accountId: null } }),
    prisma.passwordReset.count({ where: { expiresAt: { gte: now } } }),
    prisma.passwordReset.count({ where: { expiresAt: { lt: now } } }),
    prisma.profile.count(),
    prisma.vaccine.count({ where: { givenAt: { not: null } } }),
    prisma.vaccine.count(),
    prisma.bagItem.count(),
    prisma.bagItem.count({ where: { checked: true } }),
    // A timer running for more than a day is almost certainly one somebody
    // forgot to stop, not a 30-hour nap — the one row in this database that
    // usually means a person needs to be nudged.
    prisma.activeTimer.count({
      where: { startTime: { lt: new Date(now.getTime() - 86_400_000) } },
    }),
    prisma.account.count({ where: { lastSeenAt: { not: null } } }),
    prisma.account.count(),
  ]);

  const linkInvites = invites.filter((i) => i.token !== null);
  const emailInvites = invites.filter((i) => i.token === null);
  const expiredLinks = linkInvites.filter(
    (i) => i.expiresAt !== null && i.expiresAt.getTime() < now.getTime()
  ).length;

  res.json({
    generatedAt: now.toISOString(),
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    reminderMode: (process.env.REMINDER_MODE ?? "inline").toLowerCase(),
    cronConfigured: Boolean(process.env.CRON_SECRET),
    mailConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER),
    invites: {
      total: invites.length,
      email: emailInvites.length,
      link: linkInvites.length,
      expiredLinks,
    },
    reminders: {
      enabled: remindersEnabled,
      disabled: remindersDisabled,
      byType: reminderTypes
        .map((r) => ({ key: r.type, count: r._count._all }))
        .sort((a, b) => b.count - a.count),
    },
    push: {
      total: pushPlatforms.reduce((sum, p) => sum + p._count._all, 0),
      byPlatform: pushPlatforms
        .map((p) => ({ key: p.platform ?? "unknown", count: p._count._all }))
        .sort((a, b) => b.count - a.count),
    },
    settings: {
      unitSystem: unitSystems.map((u) => ({ key: u.unitSystem, count: u._count._all })),
      notificationsOn,
      notificationsOff: totalAccounts - notificationsOn,
      customThemeColor: themeColors,
    },
    content: {
      profiles,
      vaccinesGiven,
      vaccineRows,
      bagItems,
      bagChecked,
    },
    hygiene: {
      orphanLogs,
      outstandingResets,
      expiredResets,
      staleTimers,
      // Until every account has been seen once, "last active" is leaning on the
      // derived traces rather than the heartbeat — worth showing so a low
      // active count early on isn't mistaken for a drop.
      accountsWithHeartbeat: accountsSeen,
      accountsTotal: totalAccounts,
    },
  });
});

export default router;
