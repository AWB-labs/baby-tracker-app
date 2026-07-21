import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import prisma from "../lib/prisma";
import { signToken } from "../lib/jwt";
import { conflict, unauthorized } from "../lib/httpError";
import { parseOrThrow } from "../lib/validate";

const router = Router();

const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const ACCOUNT_SELECT = {
  id: true,
  name: true,
  email: true,
  unitSystem: true,
  themeColor: true,
  notificationsEnabled: true,
} as const;

/**
 * Turn every invite addressed to this email into real access.
 *
 * A caregiver can be invited before they have an account; the invite waits and
 * is redeemed here, so signing up is all they have to do. Runs in a transaction
 * so a half-claimed invite can't leave someone with a consumed invite and no
 * membership.
 */
async function claimPendingInvites(
  accountId: number,
  email: string
): Promise<number> {
  const invites = await prisma.babyInvite.findMany({
    where: { email },
    select: { id: true, babyId: true, role: true },
  });
  if (invites.length === 0) return 0;

  await prisma.$transaction([
    prisma.babyMember.createMany({
      data: invites.map((i) => ({
        babyId: i.babyId,
        accountId,
        role: i.role,
      })),
      skipDuplicates: true,
    }),
    prisma.babyInvite.deleteMany({ where: { id: { in: invites.map((i) => i.id) } } }),
  ]);

  return invites.length;
}

// POST /auth/signup
router.post("/signup", async (req: Request, res: Response): Promise<void> => {
  const { name, password, email: rawEmail } = parseOrThrow(signupSchema, req.body);
  // Stored lowercase so an invite sent to "Nana@x.com" is found when she signs
  // up as "nana@x.com".
  const email = rawEmail.trim().toLowerCase();

  const existing = await prisma.account.findUnique({ where: { email } });
  if (existing) {
    throw conflict(
      "There's already an account with that email. Try signing in instead.",
      "email_taken"
    );
  }

  const hashed = await bcrypt.hash(password, 10);
  const account = await prisma.account.create({
    data: { name, email, password: hashed },
    select: ACCOUNT_SELECT,
  });

  // Auto-create a default profile for the account owner
  await prisma.profile.create({
    data: { accountId: account.id, displayName: name },
  });

  const claimed = await claimPendingInvites(account.id, email);

  const token = signToken({ accountId: account.id, email: account.email });
  res.status(201).json({ token, account, claimedInvites: claimed });
});

// POST /auth/login
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const { password, email: rawEmail } = parseOrThrow(loginSchema, req.body);
  const email = rawEmail.trim().toLowerCase();

  const account = await prisma.account.findUnique({ where: { email } });
  // One message for both cases, so the response can't be used to discover
  // which email addresses have accounts.
  const wrong = unauthorized(
    "That email and password don't match. Please check and try again.",
    "bad_credentials"
  );
  if (!account) throw wrong;

  const valid = await bcrypt.compare(password, account.password);
  if (!valid) throw wrong;

  // Accounts that predate lowercase-normalised emails, or that were invited
  // while logged out, pick up their invites on the next sign-in.
  const claimed = await claimPendingInvites(account.id, account.email.toLowerCase());

  const token = signToken({ accountId: account.id, email: account.email });
  res.json({
    token,
    account: {
      id: account.id,
      name: account.name,
      email: account.email,
      unitSystem: account.unitSystem,
      themeColor: account.themeColor,
      notificationsEnabled: account.notificationsEnabled,
    },
    claimedInvites: claimed,
  });
});

export default router;
