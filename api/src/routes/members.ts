import { randomBytes } from "crypto";
import { Router, Response } from "express";
import { z } from "zod";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import prisma from "../lib/prisma";
import { requireBabyAccess } from "../lib/babyAccess";
import { isRelation } from "../lib/relations";
import { badRequest, conflict, forbidden, notFound } from "../lib/httpError";
import { parseOrThrow, parseId } from "../lib/validate";

const router = Router();

/**
 * Who this person is to the baby. Descriptive only — access is decided by
 * `role`, and a grandmother has exactly the same rights as a father.
 */
const relationFields = {
  relation: z.string().max(40).nullable().optional(),
  relationNote: z.string().max(60).nullable().optional(),
};

/** Rejects a relation the client made up, and drops the note unless it applies. */
function normaliseRelation(
  relation: string | null | undefined,
  relationNote: string | null | undefined
): { relation: string | null; relationNote: string | null } {
  if (!relation) return { relation: null, relationNote: null };
  if (!isRelation(relation)) {
    throw badRequest("That isn't a relationship we recognise.", "bad_relation");
  }
  return {
    relation,
    // "Other" is the only one that means anything without a name attached, so
    // it's the only one allowed to carry the free-text note.
    relationNote: relation === "other" ? relationNote?.trim() || null : null,
  };
}

const addMemberSchema = z.object({
  email: z.string().email(),
  ...relationFields,
});

/** A link invite is claimable by anyone holding it, so the token must be
 *  unguessable rather than merely unique. */
const INVITE_TTL_DAYS = 14;

const createLinkSchema = z.object({
  ...relationFields,
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
        relation: true,
        relationNote: true,
        createdAt: true,
        account: { select: { id: true, name: true, email: true } },
      },
    });

    // Only addressed invites belong in this list. A link invite has no
    // recipient to show, and listing raw tokens would hand every caregiver a
    // working key to the baby.
    const invites = await prisma.babyInvite.findMany({
      where: { babyId, email: { not: null } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        role: true,
        relation: true,
        relationNote: true,
        createdAt: true,
      },
    });

    res.json({
      members: members.map((m) => ({
        id: m.id,
        accountId: m.account.id,
        name: m.account.name,
        email: m.account.email,
        role: m.role,
        relation: m.relation,
        relationNote: m.relationNote,
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
    const {
      email: rawEmail,
      relation: rawRelation,
      relationNote: rawNote,
    } = parseOrThrow(addMemberSchema, req.body);
    const { relation, relationNote } = normaliseRelation(rawRelation, rawNote);

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
        create: { babyId, email, relation, relationNote, invitedByAccountId: accountId },
        update: { relation, relationNote },
        select: {
          id: true,
          email: true,
          role: true,
          relation: true,
          relationNote: true,
          createdAt: true,
        },
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
      data: { babyId, accountId: account.id, role: "member", relation, relationNote },
      select: { id: true, role: true, relation: true, relationNote: true, createdAt: true },
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
        relation: member.relation,
        relationNote: member.relationNote,
        joinedAt: member.createdAt,
        isYou: false,
      },
    });
  }
);

/**
 * POST /babies/:babyId/invite-link
 *
 * Mints a one-off claim code so a caregiver can be added over WhatsApp rather
 * than by guessing which address they'll sign up with. Each call makes a new
 * link and the old ones keep working until they lapse, which is deliberate:
 * re-sending shouldn't silently break the message already in someone's chat.
 */
router.post(
  "/:babyId/invite-link",
  authMiddleware,
  async (req, res: Response): Promise<void> => {
    const { accountId } = req as AuthRequest;
    const babyId = parseId(req.params.babyId, "baby");
    const { relation: rawRelation, relationNote: rawNote } = parseOrThrow(
      createLinkSchema,
      req.body
    );
    const { relation, relationNote } = normaliseRelation(rawRelation, rawNote);

    await requireBabyAccess(accountId, babyId);

    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);
    const invite = await prisma.babyInvite.create({
      data: {
        babyId,
        email: null,
        token: randomBytes(24).toString("base64url"),
        relation,
        relationNote,
        expiresAt,
        invitedByAccountId: accountId,
      },
      select: { id: true, token: true, expiresAt: true, relation: true, relationNote: true },
    });

    res.status(201).json({ ...invite, expiresInDays: INVITE_TTL_DAYS });
  }
);

/**
 * POST /babies/invites/claim  { token }
 *
 * Redeems a link invite for whoever is signed in. Deliberately not scoped to a
 * baby in the path: the caller has the token and nothing else, and looking the
 * baby up from it is the whole point.
 */
router.post(
  "/invites/claim",
  authMiddleware,
  async (req, res: Response): Promise<void> => {
    const { accountId } = req as AuthRequest;
    const { token } = parseOrThrow(
      z.object({ token: z.string().min(1) }),
      req.body
    );

    const invite = await prisma.babyInvite.findUnique({
      where: { token },
      select: {
        id: true,
        babyId: true,
        role: true,
        relation: true,
        relationNote: true,
        expiresAt: true,
        baby: { select: { name: true } },
      },
    });
    if (!invite) {
      throw notFound("That invitation link isn't valid.", "bad_invite");
    }
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
      throw badRequest(
        "That invitation link has expired. Ask for a new one.",
        "invite_expired"
      );
    }

    const existing = await prisma.babyMember.findUnique({
      where: { babyId_accountId: { babyId: invite.babyId, accountId } },
      select: { id: true },
    });
    if (existing) {
      // Not an error worth stopping on — they have what the link was offering.
      res.json({
        status: "already_member",
        babyId: invite.babyId,
        babyName: invite.baby.name,
      });
      return;
    }

    // The link is spent once it works, so a forwarded message can't quietly add
    // a second person.
    await prisma.$transaction([
      prisma.babyMember.create({
        data: {
          babyId: invite.babyId,
          accountId,
          role: invite.role,
          relation: invite.relation,
          relationNote: invite.relationNote,
        },
      }),
      prisma.babyInvite.delete({ where: { id: invite.id } }),
    ]);

    res.status(201).json({
      status: "joined",
      babyId: invite.babyId,
      babyName: invite.baby.name,
    });
  }
);

/**
 * PATCH /babies/:babyId/members/:memberAccountId  { relation, relationNote }
 *
 * Everyone who joined before relationships were asked for has none, so this is
 * how those get filled in. The owner can label anyone; anybody else can label
 * only themselves, matching who may remove whom.
 */
router.patch(
  "/:babyId/members/:memberAccountId",
  authMiddleware,
  async (req, res: Response): Promise<void> => {
    const { accountId } = req as AuthRequest;
    const babyId = parseId(req.params.babyId, "baby");
    const targetId = parseId(req.params.memberAccountId, "caregiver");
    const { relation: rawRelation, relationNote: rawNote } = parseOrThrow(
      z.object(relationFields),
      req.body
    );
    const { relation, relationNote } = normaliseRelation(rawRelation, rawNote);

    const role = await requireBabyAccess(accountId, babyId);
    if (targetId !== accountId && role !== "owner") {
      throw forbidden(
        "Only the person who created this baby can change someone else's details.",
        "owner_only"
      );
    }

    const target = await prisma.babyMember.findUnique({
      where: { babyId_accountId: { babyId, accountId: targetId } },
      select: { id: true },
    });
    if (!target) {
      throw notFound("That caregiver isn't on this baby.", "not_member");
    }

    const updated = await prisma.babyMember.update({
      where: { id: target.id },
      data: { relation, relationNote },
      select: {
        id: true,
        role: true,
        relation: true,
        relationNote: true,
        createdAt: true,
        account: { select: { id: true, name: true, email: true } },
      },
    });

    res.json({
      id: updated.id,
      accountId: updated.account.id,
      name: updated.account.name,
      email: updated.account.email,
      role: updated.role,
      relation: updated.relation,
      relationNote: updated.relationNote,
      joinedAt: updated.createdAt,
      isYou: updated.account.id === accountId,
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
