import { Router, Response } from "express";
import { z } from "zod";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import prisma from "../lib/prisma";
import { badRequest, notFound } from "../lib/httpError";
import { isRelation } from "../lib/relations";
import { parseOrThrow } from "../lib/validate";

const router = Router();

export const SETTINGS_SELECT = {
  unitSystem: true,
  themeColor: true,
  notificationsEnabled: true,
  relation: true,
  relationNote: true,
} as const;

const updateSettingsSchema = z.object({
  // Asked during onboarding, before any baby exists; editable afterwards from
  // Account. Validated against the shared list rather than taken as free text.
  relation: z.string().max(40).nullable().optional(),
  relationNote: z.string().max(60).nullable().optional(),
  unitSystem: z.enum(["metric", "imperial"]).optional(),
  themeColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour like #ff6b95.")
    .nullable()
    .optional(),
  notificationsEnabled: z.boolean().optional(),
  name: z.string().min(1).optional(),
});

// GET /settings
router.get("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, name: true, email: true, ...SETTINGS_SELECT },
  });

  if (!account) {
    throw notFound("We couldn't find your account. Please sign in again.", "no_account");
  }

  res.json(account);
});

// PATCH /settings
router.patch("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;

  const updates = parseOrThrow(updateSettingsSchema, req.body);

  if (updates.relation !== undefined) {
    if (updates.relation && !isRelation(updates.relation)) {
      throw badRequest("That isn't a relationship we recognise.", "bad_relation");
    }
    // The note only means anything alongside "other"; carrying it on a
    // Grandmother would put stale text on screen the moment they switch.
    updates.relationNote =
      updates.relation === "other" ? updates.relationNote?.trim() || null : null;
  }

  const account = await prisma.account.update({
    where: { id: accountId },
    data: updates,
    select: { id: true, name: true, email: true, ...SETTINGS_SELECT },
  });

  res.json(account);
});

const pushTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.string().max(32).optional().nullable(),
});

/**
 * POST /settings/push-token
 * Registering is idempotent, and a token always ends up attached to the account
 * that most recently sent it — otherwise a shared phone would keep delivering a
 * previous user's reminders.
 */
router.post(
  "/push-token",
  authMiddleware,
  async (req, res: Response): Promise<void> => {
    const { accountId } = req as AuthRequest;

    const { token, platform } = parseOrThrow(pushTokenSchema, req.body);

    await prisma.pushToken.upsert({
      where: { token },
      create: { accountId, token, platform: platform ?? null },
      update: { accountId, platform: platform ?? null },
    });

    res.status(204).send();
  }
);

/** DELETE /settings/push-token — stop this device receiving reminders */
router.delete(
  "/push-token",
  authMiddleware,
  async (req, res: Response): Promise<void> => {
    const { accountId } = req as AuthRequest;

    const { token } = parseOrThrow(
      z.object({ token: z.string().min(1) }),
      req.body
    );

    await prisma.pushToken.deleteMany({ where: { token, accountId } });

    res.status(204).send();
  }
);

export default router;
