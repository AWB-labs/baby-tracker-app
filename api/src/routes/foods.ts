import { randomUUID } from "crypto";
import { Router, Response } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import prisma from "../lib/prisma";
import { requireBabyAccess } from "../lib/babyAccess";
import { badRequest, notFound } from "../lib/httpError";
import { parseOrThrow, parseId } from "../lib/validate";

const router = Router();

/**
 * Solids tracking: the family's catalogue of foods tried (FoodItem) and every
 * serving of each (FoodLog). Everything is per baby and shared across its
 * caregivers, so what one parent offered at lunch is what the other sees at
 * dinner — the whole point of tracking first foods is knowing what has been
 * tried, and that only works if everyone reads the same list.
 */

const REACTIONS = [
  "none",
  "gas",
  "rash",
  "hives",
  "vomiting",
  "diarrhea",
  "swelling",
  "other",
] as const;

/**
 * Reactions that flag the food as an allergen on the catalogue entry. Gas and
 * loose stools are common with any new food and say little on their own; a
 * rash, hives, vomiting or swelling after eating is what a paediatrician asks
 * about, so those are the ones that leave a mark on the food itself.
 */
const ALLERGY_REACTIONS = new Set(["rash", "hives", "vomiting", "swelling"]);

const CATEGORIES = [
  "veg",
  "fruit",
  "grain",
  "protein",
  "dairy",
  "allergen",
  "other",
] as const;

const ITEM_SELECT = {
  id: true,
  babyId: true,
  name: true,
  emoji: true,
  category: true,
  allergen: true,
  createdAt: true,
} as const;

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
const mealTypeSchema = z.enum(MEAL_TYPES).nullable().optional();

const LOG_SELECT = {
  id: true,
  babyId: true,
  foodItemId: true,
  mealKey: true,
  mealType: true,
  mealName: true,
  eatenAt: true,
  rating: true,
  reaction: true,
  reactionNote: true,
  notes: true,
  enteredByName: true,
  createdAt: true,
  foodItem: { select: { id: true, name: true, emoji: true, allergen: true } },
} as const;

const nameSchema = z.string().trim().min(1).max(40);
const emojiSchema = z.string().trim().max(8).nullable().optional();
const categorySchema = z.enum(CATEGORIES).nullable().optional();
const ratingSchema = z.number().int().min(1).max(5).nullable().optional();
const reactionSchema = z.enum(REACTIONS).nullable().optional();

const createItemSchema = z.object({
  babyId: z.number().int().positive(),
  name: nameSchema,
  emoji: emojiSchema,
  category: categorySchema,
});

const updateItemSchema = z.object({
  name: nameSchema.optional(),
  emoji: emojiSchema,
  category: categorySchema,
  allergen: z.boolean().optional(),
});

const mealItemSchema = z
  .object({
    /** An existing catalogue entry… */
    foodItemId: z.number().int().positive().optional(),
    /** …or a new one by name, created on the fly. */
    name: nameSchema.optional(),
    emoji: emojiSchema,
    category: categorySchema,
    rating: ratingSchema,
    reaction: reactionSchema,
    reactionNote: z.string().trim().max(300).nullable().optional(),
  })
  .refine((v) => v.foodItemId != null || v.name != null, {
    message: "Each food needs an id or a name.",
  });

const createMealSchema = z.object({
  babyId: z.number().int().positive(),
  eatenAt: z.string().datetime({ offset: true }),
  mealType: mealTypeSchema,
  mealName: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  enteredByName: z.string().trim().min(1).max(80),
  items: z.array(mealItemSchema).min(1).max(20),
});

type MealBody = z.infer<typeof createMealSchema>;

/**
 * Write a meal's servings under one key. Foods given by name that aren't in
 * the catalogue yet are created on the way, and a serious reaction flags its
 * food to watch. Shared by logging a meal and editing one, which rewrites
 * the whole meal under the key it already had.
 */
async function writeMeal(
  tx: Prisma.TransactionClient,
  body: MealBody,
  mealKey: string,
  enteredByName: string
) {
  const eatenAt = new Date(body.eatenAt);
  const rows = [];
  for (const item of body.items) {
    let foodItemId = item.foodItemId ?? null;

    if (foodItemId == null) {
      const name = item.name!;
      const existing = await tx.foodItem.findFirst({
        where: { babyId: body.babyId, name: { equals: name, mode: "insensitive" } },
        select: { id: true },
      });
      foodItemId = existing
        ? existing.id
        : (
            await tx.foodItem.create({
              data: {
                babyId: body.babyId,
                name,
                emoji: item.emoji ?? null,
                category: item.category ?? null,
              },
              select: { id: true },
            })
          ).id;
    } else {
      const owned = await tx.foodItem.findFirst({
        where: { id: foodItemId, babyId: body.babyId },
        select: { id: true },
      });
      if (!owned) throw notFound("That food no longer exists.", "gone");
    }

    const reaction = item.reaction ?? "none";
    if (ALLERGY_REACTIONS.has(reaction)) {
      await tx.foodItem.update({
        where: { id: foodItemId },
        data: { allergen: true },
      });
    }

    rows.push(
      await tx.foodLog.create({
        data: {
          babyId: body.babyId,
          foodItemId,
          mealKey,
          mealType: body.mealName?.trim() ? null : body.mealType ?? null,
          mealName: body.mealName?.trim() || null,
          eatenAt,
          rating: item.rating ?? null,
          reaction,
          reactionNote: item.reactionNote ?? null,
          notes: body.notes ?? null,
          enteredByName,
        },
        select: LOG_SELECT,
      })
    );
  }
  return rows;
}

const updateLogSchema = z.object({
  eatenAt: z.string().datetime({ offset: true }).optional(),
  rating: ratingSchema,
  reaction: reactionSchema,
  reactionNote: z.string().trim().max(300).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

/** Case-insensitive lookup so "Carrot" and "carrot" are one food. */
async function findItemByName(babyId: number, name: string) {
  return prisma.foodItem.findFirst({
    where: { babyId, name: { equals: name, mode: "insensitive" } },
    select: ITEM_SELECT,
  });
}

/* -------------------------------------------------------------------------- */
/* Meals / servings — declared before /:id so "logs" is never parsed as an id  */
/* -------------------------------------------------------------------------- */

/**
 * GET /foods/logs?babyId=X&from=ISO&to=ISO — servings in a window, newest
 * first. Without a window it's the last 200, enough for a history sheet.
 */
router.get("/logs", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const babyId = parseId(req.query.babyId, "baby");
  await requireBabyAccess(accountId, babyId);

  const from = typeof req.query.from === "string" ? new Date(req.query.from) : null;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : null;
  if ((from && isNaN(from.getTime())) || (to && isNaN(to.getTime()))) {
    throw badRequest("That date range doesn't make sense.", "bad_range");
  }

  const logs = await prisma.foodLog.findMany({
    where: {
      babyId,
      ...(from || to
        ? { eatenAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
        : {}),
    },
    orderBy: [{ eatenAt: "desc" }, { id: "asc" }],
    take: from || to ? undefined : 200,
    select: LOG_SELECT,
  });

  res.json(logs);
});

/**
 * POST /foods/logs — one meal: several foods eaten together. Foods given by
 * name that aren't in the catalogue yet are created as part of the same
 * request, so "carrot + a brand-new parsnip" is one tap to save.
 */
router.post("/logs", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const body = parseOrThrow(createMealSchema, req.body);
  await requireBabyAccess(accountId, body.babyId);

  const mealKey = randomUUID();
  const created = await prisma.$transaction(
    (tx) => writeMeal(tx, body, mealKey, body.enteredByName),
    { timeout: 15_000 }
  );

  res.status(201).json(created);
});

/**
 * PUT /foods/logs/meal/:mealKey — edit a whole meal: its name or type, when
 * it was, which foods were in it and how each went. The meal is rewritten
 * under the same key in one transaction, so it can never be seen half-edited.
 * Whoever logged it stays its author.
 */
router.put("/logs/meal/:mealKey", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const mealKey = String(req.params.mealKey);
  const body = parseOrThrow(createMealSchema, req.body);
  await requireBabyAccess(accountId, body.babyId);

  const existing = await prisma.foodLog.findFirst({
    where: { mealKey, babyId: body.babyId },
    select: { enteredByName: true },
  });
  if (!existing) throw notFound("That meal no longer exists.", "gone");

  const rows = await prisma.$transaction(
    async (tx) => {
      await tx.foodLog.deleteMany({ where: { mealKey, babyId: body.babyId } });
      return writeMeal(tx, body, mealKey, existing.enteredByName);
    },
    { timeout: 15_000 }
  );

  res.json(rows);
});

// PATCH /foods/logs/:id — re-rate, change the reaction, move the time.
router.patch("/logs/:id", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const id = parseId(req.params.id, "serving");
  const body = parseOrThrow(updateLogSchema, req.body);

  const existing = await prisma.foodLog.findUnique({ where: { id } });
  if (!existing) throw notFound("That serving no longer exists.", "gone");
  await requireBabyAccess(accountId, existing.babyId);

  const log = await prisma.foodLog.update({
    where: { id },
    data: {
      ...(body.eatenAt !== undefined ? { eatenAt: new Date(body.eatenAt) } : {}),
      ...(body.rating !== undefined ? { rating: body.rating } : {}),
      ...(body.reaction !== undefined ? { reaction: body.reaction } : {}),
      ...(body.reactionNote !== undefined ? { reactionNote: body.reactionNote } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    },
    select: LOG_SELECT,
  });

  if (body.reaction && ALLERGY_REACTIONS.has(body.reaction)) {
    await prisma.foodItem.update({
      where: { id: existing.foodItemId },
      data: { allergen: true },
    });
  }

  res.json(log);
});

// DELETE /foods/logs/:id
router.delete("/logs/:id", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const id = parseId(req.params.id, "serving");

  const existing = await prisma.foodLog.findUnique({ where: { id } });
  if (!existing) throw notFound("That serving no longer exists.", "gone");
  await requireBabyAccess(accountId, existing.babyId);

  await prisma.foodLog.delete({ where: { id } });
  res.status(204).send();
});

/* -------------------------------------------------------------------------- */
/* Catalogue                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * GET /foods?babyId=X — every food tried, each with what its history says:
 * how many times, when first and last, the average rating, and the most
 * recent reaction. Computed here from the (small) serving list rather than
 * stored, so a deleted or re-rated serving is reflected immediately.
 */
/* -------------------------------------------------------------------------- */
/* Saved and want-to-try meals                                                */
/* -------------------------------------------------------------------------- */

const savedFoodSchema = z.object({ name: nameSchema, emoji: emojiSchema });

const createSavedMealSchema = z.object({
  babyId: z.number().int().positive(),
  name: z.string().trim().min(1).max(60),
  mealType: mealTypeSchema,
  foods: z.array(savedFoodSchema).min(1).max(20),
  wantToTry: z.boolean().optional(),
  rating: ratingSchema,
});

const updateSavedMealSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  mealType: mealTypeSchema,
  foods: z.array(savedFoodSchema).min(1).max(20).optional(),
  wantToTry: z.boolean().optional(),
  rating: ratingSchema,
});

type SavedMealRow = {
  id: number;
  babyId: number;
  name: string;
  mealType: string | null;
  foodsJson: string;
  wantToTry: boolean;
  rating: number | null;
  createdAt: Date;
};

/** Foods travel as an array; a corrupt stored value reads as no foods. */
function presentSavedMeal({ foodsJson, ...meal }: SavedMealRow) {
  let foods: { name: string; emoji: string | null }[] = [];
  try {
    const parsed = JSON.parse(foodsJson);
    if (Array.isArray(parsed)) foods = parsed;
  } catch {
    // Left empty.
  }
  return { ...meal, foods };
}

const SAVED_MEAL_SELECT = {
  id: true,
  babyId: true,
  name: true,
  mealType: true,
  foodsJson: true,
  wantToTry: true,
  rating: true,
  createdAt: true,
} as const;

/** GET /foods/meals?babyId=X — saved and want-to-try meals, newest first. */
router.get("/meals", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const babyId = parseId(req.query.babyId, "baby");
  await requireBabyAccess(accountId, babyId);
  const meals = await prisma.savedMeal.findMany({
    where: { babyId },
    orderBy: { createdAt: "desc" },
    select: SAVED_MEAL_SELECT,
  });
  res.json(meals.map(presentSavedMeal));
});

/** POST /foods/meals */
router.post("/meals", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const body = parseOrThrow(createSavedMealSchema, req.body);
  await requireBabyAccess(accountId, body.babyId);
  const meal = await prisma.savedMeal.create({
    data: {
      babyId: body.babyId,
      name: body.name,
      mealType: body.mealType ?? null,
      foodsJson: JSON.stringify(body.foods.map((f) => ({ name: f.name, emoji: f.emoji ?? null }))),
      // A rating means it's been tried, whatever the client said.
      wantToTry: body.rating != null ? false : body.wantToTry ?? false,
      rating: body.rating ?? null,
    },
    select: SAVED_MEAL_SELECT,
  });
  res.status(201).json(presentSavedMeal(meal));
});

/** PATCH /foods/meals/:id — rating a want-to-try meal marks it tried. */
router.patch("/meals/:id", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const id = parseId(req.params.id, "meal");
  const body = parseOrThrow(updateSavedMealSchema, req.body);
  const existing = await prisma.savedMeal.findUnique({ where: { id }, select: { babyId: true } });
  if (!existing) throw notFound("That meal no longer exists.", "gone");
  await requireBabyAccess(accountId, existing.babyId);
  const meal = await prisma.savedMeal.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.mealType !== undefined ? { mealType: body.mealType } : {}),
      ...(body.foods !== undefined
        ? { foodsJson: JSON.stringify(body.foods.map((f) => ({ name: f.name, emoji: f.emoji ?? null }))) }
        : {}),
      ...(body.wantToTry !== undefined ? { wantToTry: body.wantToTry } : {}),
      ...(body.rating !== undefined ? { rating: body.rating } : {}),
      ...(body.rating != null ? { wantToTry: false } : {}),
    },
    select: SAVED_MEAL_SELECT,
  });
  res.json(presentSavedMeal(meal));
});

/** DELETE /foods/meals/:id */
router.delete("/meals/:id", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const id = parseId(req.params.id, "meal");
  const existing = await prisma.savedMeal.findUnique({ where: { id }, select: { babyId: true } });
  if (!existing) throw notFound("That meal no longer exists.", "gone");
  await requireBabyAccess(accountId, existing.babyId);
  await prisma.savedMeal.delete({ where: { id } });
  res.status(204).send();
});

router.get("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const babyId = parseId(req.query.babyId, "baby");
  await requireBabyAccess(accountId, babyId);

  const [items, logs] = await Promise.all([
    prisma.foodItem.findMany({
      where: { babyId },
      orderBy: { name: "asc" },
      select: ITEM_SELECT,
    }),
    prisma.foodLog.findMany({
      where: { babyId },
      orderBy: { eatenAt: "desc" },
      select: {
        foodItemId: true,
        eatenAt: true,
        rating: true,
        reaction: true,
      },
    }),
  ]);

  const byItem = new Map<
    number,
    {
      timesTried: number;
      firstEatenAt: Date | null;
      lastEatenAt: Date | null;
      ratingSum: number;
      ratingCount: number;
      lastReaction: string | null;
      reactionCount: number;
    }
  >();
  for (const log of logs) {
    const s = byItem.get(log.foodItemId) ?? {
      timesTried: 0,
      firstEatenAt: null,
      lastEatenAt: null,
      ratingSum: 0,
      ratingCount: 0,
      lastReaction: null,
      reactionCount: 0,
    };
    s.timesTried += 1;
    // Newest first, so the first row seen is the latest serving.
    if (!s.lastEatenAt) s.lastEatenAt = log.eatenAt;
    s.firstEatenAt = log.eatenAt;
    if (log.rating != null) {
      s.ratingSum += log.rating;
      s.ratingCount += 1;
    }
    if (log.reaction && log.reaction !== "none") {
      s.reactionCount += 1;
      if (!s.lastReaction) s.lastReaction = log.reaction;
    }
    byItem.set(log.foodItemId, s);
  }

  res.json(
    items.map((item) => {
      const s = byItem.get(item.id);
      return {
        ...item,
        timesTried: s?.timesTried ?? 0,
        firstEatenAt: s?.firstEatenAt ?? null,
        lastEatenAt: s?.lastEatenAt ?? null,
        avgRating: s && s.ratingCount > 0 ? s.ratingSum / s.ratingCount : null,
        lastReaction: s?.lastReaction ?? null,
        reactionCount: s?.reactionCount ?? 0,
      };
    })
  );
});

/**
 * POST /foods — add a food to the catalogue without logging a serving (a
 * planned "next to try"). Returns the existing entry if the name is already
 * there, so the app can't create "Carrot" twice from two caregivers' phones.
 */
router.post("/", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const { babyId, name, emoji, category } = parseOrThrow(createItemSchema, req.body);
  await requireBabyAccess(accountId, babyId);

  const existing = await findItemByName(babyId, name);
  if (existing) {
    res.json(existing);
    return;
  }

  const item = await prisma.foodItem.create({
    data: { babyId, name, emoji: emoji ?? null, category: category ?? null },
    select: ITEM_SELECT,
  });
  res.status(201).json(item);
});

// PATCH /foods/:id — rename, re-emoji, regroup, or set/clear the allergy flag.
router.patch("/:id", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const id = parseId(req.params.id, "food");
  const body = parseOrThrow(updateItemSchema, req.body);

  const existing = await prisma.foodItem.findUnique({ where: { id } });
  if (!existing) throw notFound("That food no longer exists.", "gone");
  await requireBabyAccess(accountId, existing.babyId);

  if (body.name && body.name.toLowerCase() !== existing.name.toLowerCase()) {
    const clash = await findItemByName(existing.babyId, body.name);
    if (clash) throw badRequest(`${clash.name} is already on the list.`, "duplicate");
  }

  const item = await prisma.foodItem.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.emoji !== undefined ? { emoji: body.emoji } : {}),
      ...(body.category !== undefined ? { category: body.category } : {}),
      ...(body.allergen !== undefined ? { allergen: body.allergen } : {}),
    },
    select: ITEM_SELECT,
  });
  res.json(item);
});

// DELETE /foods/:id — takes every serving of it with it.
router.delete("/:id", authMiddleware, async (req, res: Response): Promise<void> => {
  const { accountId } = req as AuthRequest;
  const id = parseId(req.params.id, "food");

  const existing = await prisma.foodItem.findUnique({ where: { id } });
  if (!existing) throw notFound("That food no longer exists.", "gone");
  await requireBabyAccess(accountId, existing.babyId);

  await prisma.foodItem.delete({ where: { id } });
  res.status(204).send();
});

export default router;
