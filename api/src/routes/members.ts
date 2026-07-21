import { Router, Response } from "express";
import { z } from "zod";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import prisma from "../lib/prisma";
import { requireBabyAccess } from "../lib/babyAccess";
import { badRequest, conflict, forbidden, notFound } from "../lib/httpError";
import { parseOrThrow, parseId } from "../lib/validate";

const router = Router();

const addMemberSchema = z.object({
  email: z.string().email(),
});

/**
 * GET /babies/:babyId/members
 * Everyone who can see this baby, plus anyone invited who has not signed up
 * yet, so the settings screen can show both in one list.
 */
router.get(
  "/:babyId/members",
  authMiddleware,
  async (req, res: Response): Promise<void> => {
    const { accountId } = req as AuthRequest;
    const babyId = parseId(req.params.babyId, "baby");

    await requireBabyAccess(accountId, babyId);

    const members = await prisma.babyMember.findMany({
      where: { babyId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        createdAt: true,
        account: { select: { id: true, name: true, email: true } },
      },
    });

    const invites = await prisma.babyInvite.findMany({
      where: { babyId },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, role: true, createdAt: true },
    });

    res.json({
      members: members.map((m) => ({
        id: m.id,
        accountId: m.account.id,
        name: m.account.name,
        email: m.account.email,
        role: m.role,
        joinedAt: m.createdAt,
        isYou: m.account.id === accountId,
      })),
      pendingInvites: invites,
    });
  }
);

/**
 * POST /babies/:babyId/members  { email }
 * Adds a caregiver with full read/write access. If the email already has an
 * account they are added immediately; if not, the invite is parked and claimed
 * automatically when that address signs up.
 */
router.post(
  "/:babyId/members",
  authMiddleware,
  async (req, res: Response): Promise<void> => {
    const { accountId } = req as AuthRequest;
    const babyId = parseId(req.params.babyId, "baby");
    const { email: rawEmail } = parseOrThrow(addMemberSchema, req.body);

    await requireBabyAccess(accountId, babyId);

    // Emails are stored lowercase so "Nana@x.com" and "nana@x.com" are one
    // person, both when inviting and when claiming at signup.
    const email = rawEmail.trim().toLowerCase();

    const baby = await prisma.baby.findUnique({
      where: { id: babyId },
      select: { name: true },
    });

    const account = await prisma.account.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
    });

    if (!account) {
      const invite = await prisma.babyInvite.upsert({
        where: { babyId_email: { babyId, email } },
        create: { babyId, email, invitedByAccountId: accountId },
        update: {},
        select: { id: true, email: true, role: true, createdAt: true },
      });
      res.status(201).json({
        status: "invited",
        invite,
        message: `${email} doesn't have an account yet. They'll get access to ${
          baby?.name ?? "this baby"
        } as soon as they sign up with that email.`,
      });
      return;
    }

    const existing = await prisma.babyMember.findUnique({
      where: { babyId_accountId: { babyId, accountId: account.id } },
      select: { id: true },
    });
    if (existing) {
      throw conflict(
        account.id === accountId
          ? "That's you — you already have access."
          : `${account.name} already has access.`,
        "already_member"
      );
    }

    const member = await prisma.babyMember.create({
      data: { babyId, accountId: account.id, role: "member" },
      select: { id: true, role: true, createdAt: true },
    });

    res.status(201).json({
      status: "added",
      message: `${account.name} can now see and add entries for ${
        baby?.name ?? "this baby"
      }.`,
      member: {
        id: member.id,
        accountId: account.id,
        name: account.name,
        email: account.email,
        role: member.role,
        joinedAt: member.createdAt,
        isYou: false,
      },
    });
  }
);

/**
 * DELETE /babies/:babyId/members/:memberAccountId
 * The owner can remove anyone; anybody else can remove only themselves (leave).
 */
router.delete(
  "/:babyId/members/:memberAccountId",
  authMiddleware,
  async (req, res: Response): Promise<void> => {
    const { accountId } = req as AuthRequest;
    const babyId = parseId(req.params.babyId, "baby");
    const targetId = parseId(req.params.memberAccountId, "caregiver");

    const role = await requireBabyAccess(accountId, babyId);

    const isSelf = targetId === accountId;
    if (!isSelf && role !== "owner") {
      throw forbidden(
        "Only the person who created this baby can remove other caregivers.",
        "owner_only"
      );
    }

    const target = await prisma.babyMember.findUnique({
      where: { babyId_accountId: { babyId, accountId: targetId } },
      select: { id: true, role: true },
    });
    if (!target) {
      throw notFound("That caregiver isn't on this baby.", "not_member");
    }
    // Removing the owner would leave the baby with nobody who can manage
    // caregivers, and deleting it outright is a separate, explicit action.
    if (target.role === "owner") {
      throw badRequest(
        "The owner can't be removed. Delete the baby instead.",
        "cannot_remove_owner"
      );
    }

    await prisma.babyMember.delete({ where: { id: target.id } });
    // Their reminders for this baby are meaningless now.
    await prisma.reminder.deleteMany({ where: { babyId, accountId: targetId } });

    res.status(204).send();
  }
);

/** DELETE /babies/:babyId/invites/:inviteId — withdraw a pending invite */
router.delete(
  "/:babyId/invites/:inviteId",
  authMiddleware,
  async (req, res: Response): Promise<void> => {
    const { accountId } = req as AuthRequest;
    const babyId = parseId(req.params.babyId, "baby");
    const inviteId = parseId(req.params.inviteId, "invite");

    await requireBabyAccess(accountId, babyId);

    const invite = await prisma.babyInvite.findFirst({
      where: { id: inviteId, babyId },
      select: { id: true },
    });
    if (!invite) {
      throw notFound("That invitation has already been dealt with.", "gone");
    }

    await prisma.babyInvite.delete({ where: { id: invite.id } });
    res.status(204).send();
  }
);

export default router;
