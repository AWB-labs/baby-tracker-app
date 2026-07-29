import { Router, Response } from "express";
import { z } from "zod";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import prisma from "../lib/prisma";
import { isInstantLog } from "../lib/activities";
import { isHealthCondition } from "../lib/health";
import { requireBabyAccess } from "../lib/babyAccess";
import { badRequest, notFound } from "../lib/httpError";
import { parseOrThrow, parseId } from "../lib/validate";

const router = Router();

// Every field the client is allowed to read back. Kept in one place so GET,
// POST and PATCH can never drift into returning different shapes.
const LOG_SELECT = {
  id: true,
  type: true,
  side: true,
  amountMl: true,
  diaperStatus: true,
  weightKg: true,
  heightCm: true,
  healthCondition: true,
  medication: true,
  dose: true,
  feverCelsius: true,
  startTime: true,
  endTime: true,
  durationMinutes: true,
  comments: true,
  enteredByName: true,
  pauseTimelineJson: true,
  createdAt: true,
} as const;

const timelineEventSchema = z.object({
  event: z.enum(["started", "paused", "resumed", "stopped"]),
  at: z.string(),
});

const createLogSchema = z
  .object({
    babyId: z.number().int().positive(),
    type: z.enum([
      "feed",
      "pump",
      "sleep",
      "diaper",
      "shower",
      "vitamin",
      "nailcut",
      "growth",
      "health",
      // A habit the family invented. Its name travels in `comments`, so one
      // type covers every one of them without another enum change.
      "habit",
      // Once-a-day habit types. Instant logs (see lib/activities.ts); the
      // mobile habit catalogue mirrors this list.
      "tummy",
      "sunlight",
      "bath",
      "massage",
      "teeth",
      "walk",
      "medicine",
    ]),
    side: z.enum(["left", "right"]).nullable().optional(),
    amountMl: z.number().positive().nullable().optional(),
    diaperStatus: z
      .enum(["empty", "wet", "dirty", "wet_and_dirty"])
      .nullable()
      .optional(),
    weightKg: z.number().nullable().optional(),
    heightCm: z.number().nullable().optional(),
    healthCondition: z.string().nullable().optional(),
    medication: z.string().nullable().optional(),
    dose: z.string().nullable().optional(),
    feverCelsius: z.number().nullable().optional(),
    startTime: z.string(),
    endTime: z.string().nullable().optional(),
    comments: z.string().nullable().optional(),
    enteredByName: z.string().min(1),
    pauseTimeline: z.array(timelineEventSchema).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    // A feed or pump is either a nursing/pumping session (has a side) or a
    // bottle measured in ml. One of the two must be present.
    if (data.type === "feed" || data.type === "pump") {
      if (!data.side && !data.amountMl) {
        ctx.addIssue({
          code: "custom",
          message: `${data.type} requires either a side (left/right) or amountMl`,
          path: ["side"],
        });
      }
    }
    if (data.type === "growth" && !data.weightKg && !data.heightCm) {
      ctx.addIssue({
        code: "custom",
        message: "weightKg or heightCm required for growth",
        path: ["weightKg"],
      });
    }
    if (data.type === "health") {
      if (!data.healthCondition || !isHealthCondition(data.healthCondition)) {
        ctx.addIssue({
          code: "custom",
          message: "A valid health condition is required",
          path: ["healthCondition"],
        });
      } else if (
        data.healthCondition === "fever" &&
        (data.feverCelsius === undefined ||
          data.feverCelsius === null ||
          data.feverCelsius <= 0)
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Temperature is required when condition is fever",
          path: ["feverCelsius"],
        });
      }
    }
  });

// GET /logs?babyId=X&limit=200
router.get("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const babyId = parseId(req.query.babyId, "baby");
  const limit = req.query.limit === "all" ? undefined : parseInt((req.query.limit as string) || "200");

  await requireBabyAccess(accountId, babyId);

  // Scoped by baby, not by author: every caregiver sees the same timeline, so
  // a feed logged by one parent is visible to the other.
  const logs = await prisma.activityLog.findMany({
    where: { babyId },
    orderBy: { startTime: "desc" },
    take: limit,
    select: LOG_SELECT,
  });

  res.json(logs);
});

// POST /logs
router.post("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;

  const {
    babyId,
    type,
    side,
    amountMl,
    diaperStatus,
    weightKg,
    heightCm,
    healthCondition,
    medication,
    dose,
    feverCelsius,
    startTime,
    endTime,
    comments,
    enteredByName,
    pauseTimeline,
  } = parseOrThrow(createLogSchema, req.body);

  await requireBabyAccess(accountId, babyId);

  const start = new Date(startTime);
  if (isNaN(start.getTime())) {
    throw badRequest("That start time isn't valid.", "bad_start");
  }

  let end = endTime ? new Date(endTime) : null;
  if (end && isNaN(end.getTime())) {
    throw badRequest("That end time isn't valid.", "bad_end");
  }

  // An instant activity is a moment, not a span. Pin its end to its start so no
  // client can record a shower as something that took time.
  if (isInstantLog(type, { side, amountMl })) {
    end = start;
  }
  // A backwards range yields a negative duration, which corrupts day totals.
  if (end && end.getTime() < start.getTime()) {
    throw badRequest("The end time can't be before the start time.", "range");
  }

  const durationMinutes = end ? (end.getTime() - start.getTime()) / 60000 : null;

  // Only worth storing when the timer was actually paused — an unbroken
  // start/stop pair tells the reader nothing the times don't already.
  const pauseTimelineJson =
    pauseTimeline && pauseTimeline.some((e) => e.event === "paused" || e.event === "resumed")
      ? JSON.stringify(pauseTimeline)
      : null;

  const isFeedOrPump = type === "feed" || type === "pump";

  const log = await prisma.activityLog.create({
    data: {
      accountId,
      babyId,
      type,
      side: side ?? null,
      amountMl: isFeedOrPump ? amountMl ?? null : null,
      diaperStatus: type === "diaper" ? diaperStatus ?? null : null,
      weightKg: type === "growth" ? weightKg ?? null : null,
      heightCm: type === "growth" ? heightCm ?? null : null,
      healthCondition: type === "health" ? healthCondition ?? null : null,
      medication: type === "health" ? medication?.trim() || null : null,
      dose: type === "health" ? dose?.trim() || null : null,
      feverCelsius:
        type === "health" && healthCondition === "fever" ? feverCelsius ?? null : null,
      startTime: start,
      endTime: end,
      durationMinutes,
      comments: comments ?? null,
      enteredByName,
      pauseTimelineJson,
    },
    select: LOG_SELECT,
  });

  res.status(201).json(log);
});

const updateLogSchema = z.object({
  side: z.enum(["left", "right"]).nullable().optional(),
  amountMl: z.number().positive().nullable().optional(),
  diaperStatus: z
    .enum(["empty", "wet", "dirty", "wet_and_dirty"])
    .nullable()
    .optional(),
  weightKg: z.number().nullable().optional(),
  heightCm: z.number().nullable().optional(),
  healthCondition: z.string().nullable().optional(),
  medication: z.string().nullable().optional(),
  dose: z.string().nullable().optional(),
  feverCelsius: z.number().nullable().optional(),
  startTime: z.string().optional(),
  endTime: z.string().nullable().optional(),
  comments: z.string().nullable().optional(),
});

// PATCH /logs/:id
router.patch("/:id", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const id = parseId(req.params.id, "entry");
  const body = parseOrThrow(updateLogSchema, req.body);

  // Any caregiver of the baby may edit any of its entries, whoever typed it —
  // so the lookup is by id, and the baby's membership decides access.
  const existing = await prisma.activityLog.findUnique({ where: { id } });
  if (!existing) {
    throw notFound("That entry no longer exists — it may have been deleted.", "gone");
  }
  await requireBabyAccess(accountId, existing.babyId);
  const data: Record<string, unknown> = {};

  if (body.comments !== undefined) {
    data.comments = body.comments?.trim() || null;
  }

  if (body.side !== undefined) {
    if (existing.type !== "feed" && existing.type !== "pump") {
      throw badRequest("Only a feed or pump entry has a side.", "wrong_type");
    }
    data.side = body.side;
  }

  if (body.diaperStatus !== undefined) {
    if (existing.type !== "diaper") {
      throw badRequest("Only a nappy entry has a status.", "wrong_type");
    }
    data.diaperStatus = body.diaperStatus;
  }

  if (body.amountMl !== undefined) {
    if (existing.type !== "feed" && existing.type !== "pump") {
      throw badRequest("Only a feed or pump entry has an amount.", "wrong_type");
    }
    data.amountMl = body.amountMl;
  }

  if (body.weightKg !== undefined || body.heightCm !== undefined) {
    if (existing.type !== "growth") {
      throw badRequest(
        "Only a growth entry has a weight and height.",
        "wrong_type"
      );
    }
    const nextW = body.weightKg !== undefined ? body.weightKg : existing.weightKg;
    const nextH = body.heightCm !== undefined ? body.heightCm : existing.heightCm;
    if (nextW == null && nextH == null) {
      throw badRequest("Enter a weight or a height.", "growth_empty");
    }
    data.weightKg = nextW;
    data.heightCm = nextH;
  }

  if (
    body.healthCondition !== undefined ||
    body.medication !== undefined ||
    body.dose !== undefined ||
    body.feverCelsius !== undefined
  ) {
    if (existing.type !== "health") {
      throw badRequest("Only a health entry has those details.", "wrong_type");
    }

    const nextCondition =
      body.healthCondition !== undefined
        ? body.healthCondition
        : existing.healthCondition;

    if (!nextCondition || !isHealthCondition(nextCondition)) {
      throw badRequest("Pick a condition for this health entry.", "no_condition");
    }

    if (body.healthCondition !== undefined) data.healthCondition = nextCondition;
    if (body.medication !== undefined) data.medication = body.medication?.trim() || null;
    if (body.dose !== undefined) data.dose = body.dose?.trim() || null;

    if (nextCondition === "fever") {
      const temp =
        body.feverCelsius !== undefined ? body.feverCelsius : existing.feverCelsius;
      if (temp === null || temp === undefined || temp <= 0) {
        throw badRequest("Enter a temperature for a fever.", "no_temperature");
      }
      if (body.feverCelsius !== undefined || body.healthCondition !== undefined) {
        data.feverCelsius = temp;
      }
    } else if (body.healthCondition !== undefined || body.feverCelsius !== undefined) {
      data.feverCelsius = null;
    }
  }

  if (body.startTime !== undefined) {
    const start = new Date(body.startTime);
    if (isNaN(start.getTime())) {
      throw badRequest("That start time isn't valid.", "bad_start");
    }
    data.startTime = start;
  }

  if (body.endTime !== undefined) {
    if (body.endTime === null) {
      data.endTime = null;
      data.durationMinutes = null;
    } else {
      const end = new Date(body.endTime);
      if (isNaN(end.getTime())) {
        throw badRequest("That end time isn't valid.", "bad_end");
      }
      data.endTime = end;
    }
  }

  // Recompute the duration whenever either end of the range moved.
  if (data.startTime !== undefined || data.endTime !== undefined) {
    const finalStart = (data.startTime as Date) ?? existing.startTime;
    // `in` rather than `??`: an edit that explicitly clears a side or an amount
    // sets it to null, and null is exactly what decides whether the log is a
    // moment or a span. `??` would silently fall back to the stale value.
    const instant = isInstantLog(existing.type, {
      side: "side" in data ? (data.side as string | null) : existing.side,
      amountMl:
        "amountMl" in data ? (data.amountMl as number | null) : existing.amountMl,
    });

    if (instant) {
      // An instant activity is a moment, not a span: pin the end to the start
      // instead of trusting the client's. Editing one can no longer invent a
      // duration, and a row that already carries one is healed on save.
      data.endTime = finalStart;
      data.durationMinutes = 0;
    } else {
      const finalEnd =
        data.endTime === null
          ? null
          : ((data.endTime as Date | undefined) ?? existing.endTime);
      if (finalStart && finalEnd) {
        // A backwards range yields a negative duration, which corrupts day totals.
        if (finalEnd.getTime() < finalStart.getTime()) {
          throw badRequest(
            "The end time can't be before the start time.",
            "range"
          );
        }
        data.durationMinutes = (finalEnd.getTime() - finalStart.getTime()) / 60000;
      }
    }
  }

  const updated = await prisma.activityLog.update({
    where: { id },
    data,
    select: LOG_SELECT,
  });

  res.json(updated);
});

// DELETE /logs/:id
router.delete("/:id", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const id = parseId(req.params.id, "entry");

  const log = await prisma.activityLog.findUnique({
    where: { id },
    select: { id: true, babyId: true },
  });
  if (!log) {
    throw notFound("That entry no longer exists — it may have been deleted.", "gone");
  }
  await requireBabyAccess(accountId, log.babyId);

  await prisma.activityLog.delete({ where: { id } });
  res.status(204).send();
});

export default router;
