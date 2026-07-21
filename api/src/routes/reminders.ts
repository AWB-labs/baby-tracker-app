import { Router, Response } from "express";
import { z } from "zod";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import prisma from "../lib/prisma";
import { requireBabyAccess } from "../lib/babyAccess";
import {
  isReminderType,
  MIN_INTERVAL_MINUTES,
  MAX_INTERVAL_MINUTES,
} from "../lib/reminders";
import { badRequest, conflict, notFound } from "../lib/httpError";
import { parseOrThrow, parseId } from "../lib/validate";

const router = Router();

const REMINDER_SELECT = {
  id: true,
  babyId: true,
  type: true,
  label: true,
  intervalMinutes: true,
  enabled: true,
  lastNotifiedAt: true,
  createdAt: true,
} as const;

// "every [x] hours and/or [minutes]" arrives as two fields and is stored as one.
const intervalFields = {
  hours: z.number().int().min(0).max(168).optional(),
  minutes: z.number().int().min(0).max(59).optional(),
};

function totalMinutes(hours?: number, minutes?: number): number {
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

const createReminderSchema = z
  .object({
    babyId: z.number().int().positive(),
    type: z.string(),
    label: z.string().max(60).nullable().optional(),
    ...intervalFields,
  })
  .superRefine((data, ctx) => {
    if (!isReminderType(data.type)) {
      ctx.addIssue({ code: "custom", message: "Unknown reminder type", path: ["type"] });
    }
    if (data.type === "custom" && !data.label?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "A custom reminder needs a name",
        path: ["label"],
      });
    }
    const total = totalMinutes(data.hours, data.minutes);
    if (total < MIN_INTERVAL_MINUTES) {
      ctx.addIssue({
        code: "custom",
        message: `Choose an interval of at least ${MIN_INTERVAL_MINUTES} minutes`,
        path: ["minutes"],
      });
    }
    if (total > MAX_INTERVAL_MINUTES) {
      ctx.addIssue({
        code: "custom",
        message: "That interval is too long",
        path: ["hours"],
      });
    }
  });

const updateReminderSchema = z
  .object({
    label: z.string().max(60).nullable().optional(),
    enabled: z.boolean().optional(),
    ...intervalFields,
  })
  .superRefine((data, ctx) => {
    if (data.hours === undefined && data.minutes === undefined) return;
    const total = totalMinutes(data.hours, data.minutes);
    if (total < MIN_INTERVAL_MINUTES) {
      ctx.addIssue({
        code: "custom",
        message: `Choose an interval of at least ${MIN_INTERVAL_MINUTES} minutes`,
        path: ["minutes"],
      });
    }
    if (total > MAX_INTERVAL_MINUTES) {
      ctx.addIssue({
        code: "custom",
        message: "That interval is too long",
        path: ["hours"],
      });
    }
  });

/** GET /reminders?babyId=X — this caregiver's own reminders for that baby */
router.get("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const babyId = parseId(req.query.babyId, "baby");

  await requireBabyAccess(accountId, babyId);

  const reminders = await prisma.reminder.findMany({
    where: { babyId, accountId },
    orderBy: { createdAt: "asc" },
    select: REMINDER_SELECT,
  });

  res.json(reminders);
});

// POST /reminders
router.post("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;

  const { babyId, type, label, hours, minutes } = parseOrThrow(
    createReminderSchema,
    req.body
  );

  await requireBabyAccess(accountId, babyId);

  // One reminder per activity per caregiver — two "feed" reminders would just
  // double-notify. Custom ones are distinguished by their name instead.
  const duplicate = await prisma.reminder.findFirst({
    where: {
      babyId,
      accountId,
      type,
      ...(type === "custom" ? { label: label?.trim() ?? null } : {}),
    },
    select: { id: true },
  });
  if (duplicate) {
    throw conflict(
      "You already have a reminder for that. Edit the existing one instead.",
      "duplicate_reminder"
    );
  }

  const reminder = await prisma.reminder.create({
    data: {
      babyId,
      accountId,
      type,
      label: label?.trim() || null,
      intervalMinutes: totalMinutes(hours, minutes),
    },
    select: REMINDER_SELECT,
  });

  res.status(201).json(reminder);
});

// PATCH /reminders/:id
router.patch("/:id", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const id = parseId(req.params.id, "reminder");
  const { label, enabled, hours, minutes } = parseOrThrow(
    updateReminderSchema,
    req.body
  );

  // Reminders are personal, so ownership is the whole check.
  const existing = await prisma.reminder.findFirst({
    where: { id, accountId },
    select: { id: true, type: true },
  });
  if (!existing) {
    throw notFound("That reminder no longer exists.", "gone");
  }
  const data: Record<string, unknown> = {};
  if (label !== undefined) data.label = label?.trim() || null;
  if (enabled !== undefined) data.enabled = enabled;
  if (hours !== undefined || minutes !== undefined) {
    data.intervalMinutes = totalMinutes(hours, minutes);
    // A new interval starts a new countdown, otherwise a reminder shortened
    // below the time already elapsed would fire on the very next tick.
    data.lastNotifiedAt = null;
  }

  if (existing.type === "custom" && data.label === null) {
    throw badRequest("Give this reminder a name.", "label_required");
  }

  const reminder = await prisma.reminder.update({
    where: { id },
    data,
    select: REMINDER_SELECT,
  });

  res.json(reminder);
});

// DELETE /reminders/:id
router.delete("/:id", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const id = parseId(req.params.id, "reminder");

  const existing = await prisma.reminder.findFirst({
    where: { id, accountId },
    select: { id: true },
  });
  if (!existing) {
    throw notFound("That reminder no longer exists.", "gone");
  }

  await prisma.reminder.delete({ where: { id } });
  res.status(204).send();
});

export default router;
