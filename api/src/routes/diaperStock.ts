import { Router, Response } from "express";
import { z } from "zod";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import prisma from "../lib/prisma";
import { requireBabyAccess } from "../lib/babyAccess";
import { parseOrThrow, parseId } from "../lib/validate";

const router = Router();

// GET /babies/:babyId/diaper-stock
router.get(
  "/:babyId/diaper-stock",
  authMiddleware,
  async (req, res: Response): Promise<void> => {
    const { accountId } = req as AuthRequest;
    const babyId = parseId(req.params.babyId, "baby");
    await requireBabyAccess(accountId, babyId);

    const baby = await prisma.baby.findUnique({
      where: { id: babyId },
      select: { diaperStockCount: true },
    });
    res.json({ count: baby?.diaperStockCount ?? 0 });
  }
);

/**
 * `delta` moves the count relatively — positive to restock, negative to use
 * one — and is what a running total needs so two caregivers logging at once
 * both land rather than one clobbering the other. `count` sets it outright,
 * for a hand correction the same way the milk balance is corrected. Exactly
 * one of the two, never both.
 */
const adjustSchema = z
  .object({
    delta: z.number().int().optional(),
    count: z.number().int().min(0).optional(),
  })
  .refine((d) => (d.delta !== undefined) !== (d.count !== undefined), {
    message: "Send either a delta or a count, not both.",
  });

// PATCH /babies/:babyId/diaper-stock
router.patch(
  "/:babyId/diaper-stock",
  authMiddleware,
  async (req, res: Response): Promise<void> => {
    const { accountId } = req as AuthRequest;
    const babyId = parseId(req.params.babyId, "baby");
    const { delta, count } = parseOrThrow(adjustSchema, req.body);
    await requireBabyAccess(accountId, babyId);

    if (count !== undefined) {
      const baby = await prisma.baby.update({
        where: { id: babyId },
        data: { diaperStockCount: count },
        select: { diaperStockCount: true },
      });
      res.json({ count: baby.diaperStockCount });
      return;
    }

    // Applied via increment rather than read-then-write, so two devices
    // adjusting the count within the same moment both land instead of the
    // second silently overwriting the first.
    const updated = await prisma.baby.update({
      where: { id: babyId },
      data: { diaperStockCount: { increment: delta as number } },
      select: { diaperStockCount: true },
    });

    // Only clamp afterwards, in a second write, if the increment above
    // actually pushed it negative — the common case (plenty of stock left)
    // costs one query, not two.
    if (updated.diaperStockCount < 0) {
      const clamped = await prisma.baby.update({
        where: { id: babyId },
        data: { diaperStockCount: 0 },
        select: { diaperStockCount: true },
      });
      res.json({ count: clamped.diaperStockCount });
      return;
    }

    res.json({ count: updated.diaperStockCount });
  }
);

export default router;
