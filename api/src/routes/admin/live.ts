import { Router, Request, Response } from "express";
import prisma from "../../lib/adminPrisma";

const router = Router();

/**
 * GET /admin/api/live
 *
 * What is happening right now: every timer currently running somewhere, and
 * the newest entries across every family.
 *
 * Ordered by createdAt rather than startTime — this is a feed of what people
 * are doing, and a caregiver catching up on yesterday's nap at breakfast is
 * activity now, however the entry is dated.
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const limit = Math.min(100, Math.max(10, parseInt(String(req.query.limit ?? "40"), 10) || 40));

  const [timers, logs, signups] = await Promise.all([
    prisma.activeTimer.findMany({
      orderBy: { startTime: "asc" },
      select: {
        id: true,
        type: true,
        side: true,
        startTime: true,
        updatedAt: true,
        enteredByName: true,
        baby: { select: { id: true, name: true, avatarEmoji: true, avatarColor: true } },
        account: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        type: true,
        side: true,
        amountMl: true,
        diaperStatus: true,
        sleepKind: true,
        durationMinutes: true,
        weightKg: true,
        feverCelsius: true,
        startTime: true,
        endTime: true,
        createdAt: true,
        enteredByName: true,
        baby: { select: { id: true, name: true, avatarEmoji: true, avatarColor: true } },
        account: { select: { id: true, name: true } },
      },
    }),
    prisma.account.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, name: true, email: true, createdAt: true },
    }),
  ]);

  res.json({
    generatedAt: new Date().toISOString(),
    timers,
    logs,
    signups,
  });
});

export default router;
