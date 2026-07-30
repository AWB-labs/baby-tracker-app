import { randomBytes } from "crypto";
import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import prisma from "../lib/prisma";
import { signToken } from "../lib/jwt";
import { sendMail } from "../lib/mail";
import { conflict, unauthorized, badRequest } from "../lib/httpError";
import { parseOrThrow } from "../lib/validate";

const router = Router();

// The same rule signup already enforces — reset shouldn't hold a password to
// a different standard depending on which door it came in through.
const PASSWORD_RULE = z.string().min(6);

const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: PASSWORD_RULE,
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: PASSWORD_RULE,
});

/** How long a reset code is good for. Short on purpose — this is a security
 *  code, not an invite waiting to be accepted at leisure. */
const RESET_TTL_MINUTES = 60;

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
  // Addressed invites only. A link invite carries no email and is redeemed by
  // whoever opens it (POST /babies/invites/claim), not by signing up.
  const invites = await prisma.babyInvite.findMany({
    where: { email },
    select: { id: true, babyId: true, role: true, relation: true, relationNote: true },
  });
  if (invites.length === 0) return 0;

  await prisma.$transaction([
    prisma.babyMember.createMany({
      data: invites.map((i) => ({
        babyId: i.babyId,
        accountId,
        role: i.role,
        // The person who sent the invite already said who this is; asking again
        // at signup would be asking the wrong person twice.
        relation: i.relation,
        relationNote: i.relationNote,
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

// POST /auth/forgot-password
router.post(
  "/forgot-password",
  async (req: Request, res: Response): Promise<void> => {
    const { email: rawEmail } = parseOrThrow(forgotPasswordSchema, req.body);
    const email = rawEmail.trim().toLowerCase();

    // One response either way — the moment this differs for an unknown
    // address, the endpoint becomes a way to test which emails have accounts.
    const genericResult = {
      ok: true,
      message:
        "If an account exists for that email, we've sent a reset code.",
    };

    const account = await prisma.account.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
    if (!account) {
      res.json(genericResult);
      return;
    }

    // A fresh request retires any code still outstanding from an earlier one,
    // so there is only ever one valid code per account and an old email
    // sitting unread in an inbox stops being useful the moment a new one goes
    // out.
    await prisma.passwordReset.deleteMany({ where: { accountId: account.id } });

    const token = randomBytes(16).toString("base64url");
    await prisma.passwordReset.create({
      data: {
        accountId: account.id,
        token,
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
      },
    });

    // A failed send is a real server problem, not a per-user secret, so it's
    // fine — necessary, even — for this to surface as a 500 rather than
    // silently reporting success for an email that never arrived.
    await sendMail({
      to: account.email,
      subject: "Reset your Baby Tracker password",
      text:
        `Someone asked to reset the password on this account.\n\n` +
        `Your reset code: ${token}\n\n` +
        `Enter it in the app within ${RESET_TTL_MINUTES} minutes. ` +
        `If this wasn't you, nothing needs doing — your password hasn't changed.`,
      html:
        `<p>Someone asked to reset the password on this account.</p>` +
        `<p style="font-size:20px;font-weight:700;letter-spacing:1px">${token}</p>` +
        `<p>Enter it in the app within ${RESET_TTL_MINUTES} minutes. ` +
        `If this wasn't you, nothing needs doing — your password hasn't changed.</p>`,
    });

    res.json(genericResult);
  }
);

// POST /auth/reset-password
router.post(
  "/reset-password",
  async (req: Request, res: Response): Promise<void> => {
    const { token, password } = parseOrThrow(resetPasswordSchema, req.body);

    const reset = await prisma.passwordReset.findUnique({
      where: { token },
      select: { id: true, accountId: true, expiresAt: true },
    });

    // Same message whether the code is wrong, already used, or expired —
    // there's nothing a caller legitimately does differently for any of the
    // three, and distinguishing them tells an attacker more than a user needs.
    const invalid = badRequest(
      "That code is invalid or has expired. Request a new one.",
      "bad_reset_code"
    );
    if (!reset || reset.expiresAt.getTime() < Date.now()) {
      throw invalid;
    }

    const hashed = await bcrypt.hash(password, 10);

    // The code is single-use: deleting it here, in the same transaction as
    // the password change, is what stops it from being replayed if it leaked
    // — successfully or not, this is the last thing it's ever good for.
    await prisma.$transaction([
      prisma.account.update({
        where: { id: reset.accountId },
        data: { password: hashed },
      }),
      prisma.passwordReset.deleteMany({ where: { accountId: reset.accountId } }),
    ]);

    res.json({ ok: true, message: "Password updated. Sign in with your new one." });
  }
);

export default router;
