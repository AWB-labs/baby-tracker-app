import { Router, Response } from "express";
import { z } from "zod";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import prisma from "../lib/prisma";
import { requireBabyAccess } from "../lib/babyAccess";
import {
  isReminderType,
  serialiseDays,
  parseDays,
  MIN_TIME_OF_DAY,
  MAX_TIME_OF_DAY,
} from "../lib/reminders";
import { badRequest, conflict, notFound } from "../lib/httpError";
import { parseOrThrow, parseId } from "../lib/validate";

const router = Router();

const REMINDER_SELECT = {
  id: true,
  babyId: true,
  type: true,
  label: true,
  timeOfDay: true,
  daysOfWeek: true,
  tzOffsetMinutes: true,
  enabled: true,
  lastNotifiedAt: true,
  createdAt: true,
} as const;

type StoredReminder = {
  daysOfWeek: string | null;
  [key: string]: unknown;
};

/** Days are stored as a string but travel as an array the client can render. */
function present<T extends StoredReminder>(reminder: T) {
  return { ...reminder, daysOfWeek: parseDays(reminder.daysOfWeek) };
}

/**
 * When the reminder fires: a wall-clock time on chosen days.
 *
 * `timeOfDay` is minutes after local midnight, which the client computes from
 * its own picker — sending an hour and a minute separately only invites the two
 * to disagree. An empty day array or all seven both mean "no restriction", and
 * null clears one that was set.
 */
const scheduleFields = {
  timeOfDay: z.number().int().min(MIN_TIME_OF_DAY).max(MAX_TIME_OF_DAY).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  // Minutes to ADD to UTC for the caregiver's local time, i.e. +180 for Cairo.
  tzOffsetMinutes: z.number().int().min(-840).max(840).nullable().optional(),
};

const createReminderSchema = z
  .object({
    babyId: z.number().int().positive(),
    type: z.string(),
    label: z.string().max(60).nullable().optional(),
    ...scheduleFields,
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
    if (data.timeOfDay === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Choose a time for this reminder",
        path: ["timeOfDay"],
      });
    }
  });

const updateReminderSchema = z.object({
  label: z.string().max(60).nullable().optional(),
  enabled: z.boolean().optional(),
  ...scheduleFields,
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

  res.json(reminders.map(present));
});

// POST /reminders
router.post("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;

  const { babyId, type, label, timeOfDay, daysOfWeek, tzOffsetMinutes } =
    parseOrThrow(createReminderSchema, req.body);

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
      timeOfDay: timeOfDay!,
      daysOfWeek: serialiseDays(daysOfWeek),
      // Always stored now, whether or not days are restricted: a time of day
      // can't be evaluated without knowing whose clock it is.
      tzOffsetMinutes: tzOffsetMinutes ?? null,
    },
    select: REMINDER_SELECT,
  });

  res.status(201).json(present(reminder));
});

// PATCH /reminders/:id
router.patch("/:id", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const id = parseId(req.params.id, "reminder");
  const { label, enabled, timeOfDay, daysOfWeek, tzOffsetMinutes } =
    parseOrThrow(updateReminderSchema, req.body);

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
  if (timeOfDay !== undefined) {
    data.timeOfDay = timeOfDay;
    // Moving the time clears today's delivery record, so a reminder pushed from
    // 9am to 6pm still arrives this evening rather than counting as already
    // sent for the day.
    data.lastNotifiedAt = null;
  }
  if (daysOfWeek !== undefined) data.daysOfWeek = serialiseDays(daysOfWeek);
  if (tzOffsetMinutes !== undefined) data.tzOffsetMinutes = tzOffsetMinutes ?? null;

  if (existing.type === "custom" && data.label === null) {
    throw badRequest("Give this reminder a name.", "label_required");
  }

  const reminder = await prisma.reminder.update({
    where: { id },
    data,
    select: REMINDER_SELECT,
  });

  res.json(present(reminder));
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
