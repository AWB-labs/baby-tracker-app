import { Router, Response } from "express";
import { z } from "zod";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import prisma from "../lib/prisma";
import { requireBabyAccess } from "../lib/babyAccess";
import { isVaccineMonth, LAST_MONTH, FIRST_MONTH } from "../lib/vaccines";
import { badRequest } from "../lib/httpError";
import { parseOrThrow, parseId } from "../lib/validate";

const router = Router();

const VACCINE_SELECT = {
  id: true,
  babyId: true,
  monthNumber: true,
  givenAt: true,
  notes: true,
  updatedAt: true,
} as const;

/**
 * Only the months a family has actually touched are stored, so the client fills
 * the rest of the 1–12 grid from its own copy of the schedule. Marking a month
 * not-given clears the date but keeps any note, which is why this is an upsert
 * rather than a create/delete pair.
 */
const upsertSchema = z.object({
  babyId: z.number().int().positive(),
  monthNumber: z.number().int(),
  /** ISO date the dose was given, or null for "not taken yet". */
  givenAt: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

/** GET /vaccines?babyId=X — every recorded month for this baby */
router.get("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const babyId = parseId(req.query.babyId, "baby");

  await requireBabyAccess(accountId, babyId);

  const vaccines = await prisma.vaccine.findMany({
    where: { babyId },
    orderBy: { monthNumber: "asc" },
    select: VACCINE_SELECT,
  });

  res.json(vaccines);
});

/** PUT /vaccines — record or update one month */
router.put("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const { babyId, monthNumber, givenAt, notes } = parseOrThrow(
    upsertSchema,
    req.body
  );

  await requireBabyAccess(accountId, babyId);

  if (!isVaccineMonth(monthNumber)) {
    throw badRequest(
      `Month must be between ${FIRST_MONTH} and ${LAST_MONTH}.`,
      "bad_month"
    );
  }

  let given: Date | null = null;
  if (givenAt) {
    given = new Date(givenAt);
    if (isNaN(given.getTime())) {
      throw badRequest("That date isn't valid.", "bad_date");
    }
  }

  const trimmedNotes = notes?.trim() || null;

  const vaccine = await prisma.vaccine.upsert({
    where: { babyId_monthNumber: { babyId, monthNumber } },
    create: { babyId, monthNumber, givenAt: given, notes: trimmedNotes },
    update: {
      givenAt: given,
      // `undefined` leaves a note alone; an explicit null clears it. Ticking a
      // month off shouldn't silently discard what someone wrote about it.
      ...(notes !== undefined ? { notes: trimmedNotes } : {}),
    },
    select: VACCINE_SELECT,
  });

  res.json(vaccine);
});

export default router;
