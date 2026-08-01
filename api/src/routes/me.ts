import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import prisma from "../lib/prisma";
import { SETTINGS_SELECT } from "./settings";
import { notFound } from "../lib/httpError";

const router = Router();

// GET /me
router.get("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;

  // This is the request the app blocks its first screen on, and none of the
  // three reads depends on another. Issued together they cost one round-trip to
  // the database instead of three — the difference is most of the wait on a
  // cold serverless function.
  const [account, memberships, profiles] = await Promise.all([
    prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        ...SETTINGS_SELECT,
      },
    }),
    // Every baby this account is a caregiver for, not just the ones it created.
    prisma.babyMember.findMany({
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
    }),
    prisma.profile.findMany({
      where: { accountId },
      orderBy: { createdAt: "asc" },
      select: { id: true, displayName: true },
    }),
  ]);

  if (!account) {
    throw notFound("We couldn't find your account. Please sign in again.", "no_account");
  }

  res.json({
    account,
    babies: memberships.map((m) => ({ ...m.baby, role: m.role })),
    profiles,
  });
});

/**
 * DELETE /me — permanently delete the signed-in account.
 *
 * A single delete, entirely driven by the FK behaviour declared in the
 * schema: every baby this account owns cascades away in full (members,
 * invites, vaccines, bag items, reminders and logs — the whole record, for
 * every caregiver on it, not just this one), while babies it merely
 * caregives cascade only this account's own membership, reminders and push
 * tokens. Logs it authored on someone else's baby outlive it — ActivityLog's
 * account relation is SetNull, not Cascade, so those rows stay in the baby's
 * history with accountId cleared instead of disappearing with the author.
 */
router.delete("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;

  await prisma.account.delete({ where: { id: accountId } });
  res.status(204).send();
});

export default router;
