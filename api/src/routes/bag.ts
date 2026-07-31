import { Router, Response } from "express";
import { z } from "zod";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import prisma from "../lib/prisma";
import { requireBabyAccess } from "../lib/babyAccess";
import { notFound } from "../lib/httpError";
import { parseOrThrow, parseId } from "../lib/validate";

const router = Router();

const BAG_ITEM_SELECT = {
  id: true,
  babyId: true,
  label: true,
  checked: true,
  order: true,
  createdAt: true,
} as const;

const createBagItemSchema = z.object({
  babyId: z.number().int().positive(),
  label: z.string().trim().min(1).max(60),
});

const updateBagItemSchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  checked: z.boolean().optional(),
  order: z.number().int().optional(),
});

/** GET /bag-items?babyId=X — one shared list per baby, not per caregiver. */
router.get("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const babyId = parseId(req.query.babyId, "baby");

  await requireBabyAccess(accountId, babyId);

  const items = await prisma.bagItem.findMany({
    where: { babyId },
    // createdAt breaks ties among rows that share an order — every row does,
    // until the first reorder ever touches them.
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: BAG_ITEM_SELECT,
  });

  res.json(items);
});

// POST /bag-items
router.post("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const { babyId, label } = parseOrThrow(createBagItemSchema, req.body);

  await requireBabyAccess(accountId, babyId);

  // Appends to the end of this baby's list, not just "0" — a fresh item
  // sharing the default with everything already there would sort wherever
  // the createdAt tiebreaker happened to put it, which for an existing list
  // is the middle as often as the end.
  const last = await prisma.bagItem.aggregate({
    where: { babyId },
    _max: { order: true },
  });
  const order = (last._max.order ?? -1) + 1;

  const item = await prisma.bagItem.create({
    data: { babyId, label, order },
    select: BAG_ITEM_SELECT,
  });

  res.status(201).json(item);
});

// PATCH /bag-items/:id — rename, toggle checked, and/or move it (order is a
// straight swap with a neighbour's value, decided client-side). Looked up by
// id alone, same as a log entry: any caregiver of the baby may edit any item
// on its list, whoever added it.
router.patch("/:id", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const id = parseId(req.params.id, "item");
  const { label, checked, order } = parseOrThrow(updateBagItemSchema, req.body);

  const existing = await prisma.bagItem.findUnique({ where: { id } });
  if (!existing) {
    throw notFound("That item no longer exists.", "gone");
  }
  await requireBabyAccess(accountId, existing.babyId);

  const item = await prisma.bagItem.update({
    where: { id },
    data: {
      ...(label !== undefined ? { label } : {}),
      ...(checked !== undefined ? { checked } : {}),
      ...(order !== undefined ? { order } : {}),
    },
    select: BAG_ITEM_SELECT,
  });

  res.json(item);
});

// DELETE /bag-items/:id
router.delete("/:id", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const id = parseId(req.params.id, "item");

  const existing = await prisma.bagItem.findUnique({ where: { id } });
  if (!existing) {
    throw notFound("That item no longer exists.", "gone");
  }
  await requireBabyAccess(accountId, existing.babyId);

  await prisma.bagItem.delete({ where: { id } });
  res.status(204).send();
});

export default router;
