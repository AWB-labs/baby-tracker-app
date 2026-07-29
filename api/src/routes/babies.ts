import { Router, Response } from "express";
import { z } from "zod";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import prisma from "../lib/prisma";
import { requireBabyAccess } from "../lib/babyAccess";
import { parseOrThrow, parseId } from "../lib/validate";

const router = Router();

const BABY_SELECT = {
  id: true,
  name: true,
  dob: true,
  gender: true,
  avatarEmoji: true,
  avatarColor: true,
  ownerAccountId: true,
  createdAt: true,
} as const;

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour like #ff6b95.");

const createBabySchema = z.object({
  // Optional: a baby who isn't named yet becomes "Baby" until they are.
  name: z.string().max(60).optional().nullable(),
  gender: z.enum(["girl", "boy"]),
  dob: z.string().optional().nullable(),
  avatarEmoji: z.string().max(8).optional().nullable(),
  avatarColor: hexColor.optional().nullable(),
});

const updateBabySchema = z.object({
  name: z.string().min(1).optional(),
  gender: z.enum(["girl", "boy"]).optional(),
  dob: z.string().nullable().optional(),
  avatarEmoji: z.string().max(8).nullable().optional(),
  avatarColor: hexColor.nullable().optional(),
});

// POST /babies
router.post("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const { name, gender, dob, avatarEmoji, avatarColor } = parseOrThrow(
    createBabySchema,
    req.body
  );

  // Onboarding asks who you are before it asks about the baby, so the answer is
  // on the account and is stamped onto the membership here.
  const creator = await prisma.account.findUnique({
    where: { id: accountId },
    select: { relation: true, relationNote: true },
  });

  // The creator is a member like anyone else, just with the owner role — so
  // there is exactly one way to check access everywhere else.
  const baby = await prisma.baby.create({
    data: {
      ownerAccountId: accountId,
      // Naming a baby can wait — plenty aren't named on day one, and being
      // stopped at the first screen over it is a poor welcome.
      name: name?.trim() || "Baby",
      gender,
      dob: dob ? new Date(dob) : null,
      avatarEmoji: avatarEmoji ?? null,
      avatarColor: avatarColor ?? null,
      members: {
        create: {
          accountId,
          role: "owner",
          relation: creator?.relation ?? null,
          relationNote: creator?.relationNote ?? null,
        },
      },
    },
    select: BABY_SELECT,
  });

  res.status(201).json(baby);
});

// GET /babies — every baby this account is a caregiver for
router.get("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;

  const babies = await prisma.baby.findMany({
    where: { members: { some: { accountId } } },
    orderBy: { createdAt: "asc" },
    select: BABY_SELECT,
  });

  res.json(babies);
});

// PATCH /babies/:id — rename, re-date, or restyle the baby
router.patch("/:id", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const babyId = parseId(req.params.id, "baby");
  const { name, gender, dob, avatarEmoji, avatarColor } = parseOrThrow(
    updateBabySchema,
    req.body
  );

  await requireBabyAccess(accountId, babyId);

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (gender !== undefined) data.gender = gender;
  if (dob !== undefined) data.dob = dob ? new Date(dob) : null;
  if (avatarEmoji !== undefined) data.avatarEmoji = avatarEmoji;
  if (avatarColor !== undefined) data.avatarColor = avatarColor;

  const baby = await prisma.baby.update({
    where: { id: babyId },
    data,
    select: BABY_SELECT,
  });

  res.json(baby);
});

// DELETE /babies/:id — owner only; cascades to logs, members and reminders
router.delete("/:id", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const babyId = parseId(req.params.id, "baby");

  await requireBabyAccess(accountId, babyId, { requireOwner: true });

  await prisma.baby.delete({ where: { id: babyId } });
  res.status(204).send();
});

export default router;
