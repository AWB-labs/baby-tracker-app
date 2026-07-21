import { Router, Response } from "express";
import { z } from "zod";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import prisma from "../lib/prisma";
import { parseOrThrow } from "../lib/validate";

const router = Router();

const createProfileSchema = z.object({
  displayName: z.string().min(1),
});

// POST /profiles
router.post("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;

  const { displayName } = parseOrThrow(createProfileSchema, req.body);

  const profile = await prisma.profile.create({
    data: { accountId, displayName },
    select: { id: true, displayName: true },
  });

  res.status(201).json(profile);
});

// GET /profiles
router.get("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;

  const profiles = await prisma.profile.findMany({
    where: { accountId },
    select: { id: true, displayName: true },
  });

  res.json(profiles);
});

export default router;
