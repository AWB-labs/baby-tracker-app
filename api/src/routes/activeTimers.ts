import { Router, Response } from "express";
import { z } from "zod";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import prisma from "../lib/prisma";
import { requireBabyAccess } from "../lib/babyAccess";
import { badRequest } from "../lib/httpError";
import { parseOrThrow, parseId } from "../lib/validate";

const router = Router();

const TIMER_TYPES = ["feed", "pump", "sleep"] as const;

const ACTIVE_TIMER_SELECT = {
  id: true,
  babyId: true,
  type: true,
  accountId: true,
  enteredByName: true,
  startTime: true,
  side: true,
  updatedAt: true,
} as const;

/**
 * A lock abandoned by a crash, a force-quit, or a reinstall would otherwise
 * block that activity for the baby forever. Nothing tracked here legitimately
 * runs this long, so a lock older than this is treated as gone rather than
 * held — the next start simply claims it fresh instead of needing a person to
 * find and clear it by hand.
 */
const STALE_MS = 24 * 60 * 60 * 1000;

function isStale(updatedAt: Date): boolean {
  return Date.now() - updatedAt.getTime() > STALE_MS;
}

// GET /active-timers?babyId=X
router.get("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const babyId = parseId(req.query.babyId, "baby");
  await requireBabyAccess(accountId, babyId);

  const timers = await prisma.activeTimer.findMany({
    where: { babyId },
    select: ACTIVE_TIMER_SELECT,
  });

  const fresh = timers.filter((t) => !isStale(t.updatedAt));
  const staleIds = timers.filter((t) => isStale(t.updatedAt)).map((t) => t.id);
  if (staleIds.length > 0) {
    await prisma.activeTimer.deleteMany({ where: { id: { in: staleIds } } });
  }

  res.json(fresh);
});

const startSchema = z.object({
  babyId: z.number().int().positive(),
  type: z.enum(TIMER_TYPES),
  side: z.enum(["left", "right"]).nullable().optional(),
  startTime: z.string(),
  enteredByName: z.string().min(1),
});

/**
 * POST /active-timers — claim the lock for this activity.
 *
 * 409 with the existing lock's details when someone already holds it, so the
 * app can say who and since when instead of a bare "try again".
 */
router.post("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const { babyId, type, side, startTime, enteredByName } = parseOrThrow(
    startSchema,
    req.body
  );
  await requireBabyAccess(accountId, babyId);

  const start = new Date(startTime);
  if (isNaN(start.getTime())) {
    throw badRequest("That start time isn't valid.", "bad_start");
  }

  const existing = await prisma.activeTimer.findUnique({
    where: { babyId_type: { babyId, type } },
    select: ACTIVE_TIMER_SELECT,
  });
  if (existing && !isStale(existing.updatedAt)) {
    res.status(409).json({
      error: `A ${type} is already running for this baby.`,
      code: "timer_running",
      timer: existing,
    });
    return;
  }

  // Either nothing was there, or what was there is stale — clear it first so
  // the create below can't collide with it.
  if (existing) {
    await prisma.activeTimer.deleteMany({ where: { id: existing.id } });
  }

  try {
    const created = await prisma.activeTimer.create({
      data: {
        babyId,
        type,
        accountId,
        enteredByName,
        startTime: start,
        side: side ?? null,
      },
      select: ACTIVE_TIMER_SELECT,
    });
    res.status(201).json(created);
  } catch (err) {
    // Two starts landed in the gap between the check above and this create —
    // the unique index is the real guard, the findUnique was only a fast path
    // for a friendlier response. Whoever won that race owns the lock now.
    const isUniqueViolation =
      typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
    if (!isUniqueViolation) throw err;

    const winner = await prisma.activeTimer.findUnique({
      where: { babyId_type: { babyId, type } },
      select: ACTIVE_TIMER_SELECT,
    });
    res.status(409).json({
      error: `A ${type} is already running for this baby.`,
      code: "timer_running",
      timer: winner,
    });
  }
});

// DELETE /active-timers?babyId=X&type=Y — release the lock. Idempotent: if
// it's already gone (finished from another device, or expired as stale),
// there's nothing more to do.
router.delete("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const babyId = parseId(req.query.babyId, "baby");
  const type = typeof req.query.type === "string" ? req.query.type : "";
  if (!TIMER_TYPES.includes(type as (typeof TIMER_TYPES)[number])) {
    throw badRequest("That isn't a timed activity.", "bad_type");
  }
  await requireBabyAccess(accountId, babyId);

  await prisma.activeTimer.deleteMany({ where: { babyId, type } });
  res.status(204).send();
});

export default router;
