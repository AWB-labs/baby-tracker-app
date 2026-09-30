import { Router, Response } from "express";
import { z } from "zod";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import prisma from "../lib/prisma";
import { requireBabyAccess } from "../lib/babyAccess";
import {
  isReminderType,
  serialiseDays,
  parseDays,
  serialiseTimes,
  parseTimes,
  MIN_TIME_OF_DAY,
  MAX_TIME_OF_DAY,
  MAX_TIMES_PER_DAY,
  MIN_EVERY_DAYS,
  MAX_EVERY_DAYS,
  MIN_EVERY_MINUTES,
  MAX_EVERY_MINUTES,
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
  timesOfDay: true,
  daysOfWeek: true,
  everyDays: true,
  everyMinutes: true,
  tzOffsetMinutes: true,
  enabled: true,
  lastNotifiedAt: true,
  createdAt: true,
} as const;

type StoredReminder = {
  daysOfWeek: string | null;
  timeOfDay: number;
  timesOfDay: string | null;
  [key: string]: unknown;
};

/** Days and times are stored as strings but travel as arrays the client can
 *  render. `timesOfDay` always has at least one entry — `timeOfDay` alone
 *  when it only fires once a day. */
function present<T extends StoredReminder>(reminder: T) {
  return {
    ...reminder,
    daysOfWeek: parseDays(reminder.daysOfWeek),
    timesOfDay: parseTimes(reminder.timesOfDay, reminder.timeOfDay),
  };
}

/** The earliest valid time in a list, which `timeOfDay` mirrors. */
function firstTime(times: number[] | null | undefined): number | undefined {
  const valid = (times ?? []).filter(
    (t) => Number.isInteger(t) && t >= MIN_TIME_OF_DAY && t <= MAX_TIME_OF_DAY
  );
  return valid.length > 0 ? Math.min(...valid) : undefined;
}

/**
 * When the reminder fires: one or more wall-clock times on chosen days, one
 * time every N days, or every N minutes counted from the last log. The three
 * schedule modes are mutually exclusive (see the model comments on
 * Reminder.everyDays and Reminder.everyMinutes).
 *
 * `timeOfDay` is minutes after local midnight, which the client computes from
 * its own picker — sending an hour and a minute separately only invites the two
 * to disagree. An empty day array or all seven both mean "no restriction", and
 * null clears one that was set.
 */
const scheduleFields = {
  timeOfDay: z.number().int().min(MIN_TIME_OF_DAY).max(MAX_TIME_OF_DAY).optional(),
  // Several times a day, on the weekday schedule. Sent by app versions that
  // know about it; older ones only ever send timeOfDay.
  timesOfDay: z
    .array(z.number().int().min(MIN_TIME_OF_DAY).max(MAX_TIME_OF_DAY))
    .max(MAX_TIMES_PER_DAY)
    .nullable()
    .optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  everyDays: z.number().int().min(MIN_EVERY_DAYS).max(MAX_EVERY_DAYS).nullable().optional(),
  everyMinutes: z
    .number()
    .int()
    .min(MIN_EVERY_MINUTES)
    .max(MAX_EVERY_MINUTES)
    .nullable()
    .optional(),
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
    if (data.timeOfDay === undefined && firstTime(data.timesOfDay) === undefined) {
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

  const {
    babyId,
    type,
    label,
    timeOfDay,
    timesOfDay,
    daysOfWeek,
    everyDays,
    everyMinutes,
    tzOffsetMinutes,
  } = parseOrThrow(createReminderSchema, req.body);

  await requireBabyAccess(accountId, babyId);

  // One reminder per activity per caregiver — two "feed" reminders would just
  // double-notify, and one reminder can now fire several times a day, which
  // is what a second one was usually for. Custom ones are distinguished by
  // their name instead.
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
      "You already have a reminder for that. Open it to add more times instead.",
      "duplicate_reminder"
    );
  }

  // A vaccine reminder is monthly, from the date of birth, and has no modes.
  const hourly = type !== "vaccine" && everyMinutes ? everyMinutes : null;
  const daily = !hourly && !everyDays && type !== "vaccine";

  const reminder = await prisma.reminder.create({
    data: {
      babyId,
      accountId,
      type,
      label: label?.trim() || null,
      // Checked above: at least one of the two is there.
      timeOfDay: firstTime(timesOfDay) ?? timeOfDay!,
      // The schedule modes are mutually exclusive — an interval clears any
      // weekday restriction or extra times, since it's the one in effect.
      timesOfDay: daily ? serialiseTimes(timesOfDay) : null,
      daysOfWeek: daily ? serialiseDays(daysOfWeek) : null,
      everyDays: hourly ? null : everyDays ?? null,
      everyMinutes: hourly,
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
  const {
    label,
    enabled,
    timeOfDay,
    timesOfDay,
    daysOfWeek,
    everyDays,
    everyMinutes,
    tzOffsetMinutes,
  } = parseOrThrow(updateReminderSchema, req.body);

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
  if (timeOfDay !== undefined) data.timeOfDay = timeOfDay;
  if (timesOfDay !== undefined) {
    data.timesOfDay = serialiseTimes(timesOfDay);
    const first = firstTime(timesOfDay);
    if (first !== undefined) data.timeOfDay = first;
  } else if (timeOfDay !== undefined) {
    // Only an app version that predates several times a day sends a time
    // without the list — and it's editing the one time it can see.
    data.timesOfDay = null;
  }
  if (timeOfDay !== undefined || timesOfDay !== undefined) {
    // Moving the time clears today's delivery record, so a reminder pushed
    // from 9am to 6pm still arrives this evening rather than counting as
    // already sent for the day.
    data.lastNotifiedAt = null;
  }
  if (daysOfWeek !== undefined) data.daysOfWeek = serialiseDays(daysOfWeek);
  if (everyDays !== undefined) data.everyDays = everyDays ?? null;
  if (everyMinutes !== undefined) {
    data.everyMinutes = existing.type === "vaccine" ? null : everyMinutes ?? null;
  } else if (daysOfWeek !== undefined || everyDays !== undefined) {
    // Same story: an older app choosing a days schedule doesn't know the
    // hourly mode exists, so it can't have meant to keep it.
    data.everyMinutes = null;
  }
  if (tzOffsetMinutes !== undefined) data.tzOffsetMinutes = tzOffsetMinutes ?? null;

  // The schedule modes are mutually exclusive — the client sends all of them
  // together on any schedule change, but whichever interval takes effect
  // always wins over stale weekday settings regardless.
  if (data.everyMinutes) {
    data.everyDays = null;
    data.daysOfWeek = null;
    data.timesOfDay = null;
  }
  if (data.everyDays) {
    data.daysOfWeek = null;
    data.timesOfDay = null;
  }

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
