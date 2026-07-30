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
  createdAt: true,
} as const;

const createBagItemSchema = z.object({
  babyId: z.number().int().positive(),
  label: z.string().trim().min(1).max(60),
});

const updateBagItemSchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  checked: z.boolean().optional(),
});

/** GET /bag-items?babyId=X — one shared list per baby, not per caregiver. */
router.get("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const babyId = parseId(req.query.babyId, "baby");

  await requireBabyAccess(accountId, babyId);

  const items = await prisma.bagItem.findMany({
    where: { babyId },
    orderBy: { createdAt: "asc" },
    select: BAG_ITEM_SELECT,
  });

  res.json(items);
});

// POST /bag-items
router.post("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const { babyId, label } = parseOrThrow(createBagItemSchema, req.body);

  await requireBabyAccess(accountId, babyId);

  const item = await prisma.bagItem.create({
    data: { babyId, label },
    select: BAG_ITEM_SELECT,
  });

  res.status(201).json(item);
});

// PATCH /bag-items/:id — rename and/or toggle checked. Looked up by id alone,
// same as a log entry: any caregiver of the baby may edit any item on its
// list, whoever added it.
router.patch("/:id", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const id = parseId(req.params.id, "item");
  const { label, checked } = parseOrThrow(updateBagItemSchema, req.body);

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
