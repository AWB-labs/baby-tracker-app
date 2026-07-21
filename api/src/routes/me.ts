import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import prisma from "../lib/prisma";
import { SETTINGS_SELECT } from "./settings";
import { notFound } from "../lib/httpError";

const router = Router();

// GET /me
router.get("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      ...SETTINGS_SELECT,
    },
  });

  if (!account) {
    throw notFound("We couldn't find your account. Please sign in again.", "no_account");
  }

  // Every baby this account is a caregiver for, not just the ones it created.
  const memberships = await prisma.babyMember.findMany({
    where: { accountId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      baby: {
        select: {
          id: true,
          name: true,
          dob: true,
          gender: true,
          avatarEmoji: true,
          avatarColor: true,
          ownerAccountId: true,
          createdAt: true,
        },
      },
    },
  });

  const profiles = await prisma.profile.findMany({
    where: { accountId },
    orderBy: { createdAt: "asc" },
    select: { id: true, displayName: true },
  });

  res.json({
    account,
    babies: memberships.map((m) => ({ ...m.baby, role: m.role })),
    profiles,
  });
});

export default router;
