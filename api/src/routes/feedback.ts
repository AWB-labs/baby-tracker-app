import { Router, Response } from "express";
import { z } from "zod";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import prisma from "../lib/prisma";
import { parseOrThrow } from "../lib/validate";

const router = Router();

/**
 * Long enough for someone to describe a missing feature properly, short
 * enough that a runaway paste can't be used to fill the table. Anything
 * past this is rejected rather than silently truncated — a request that
 * came back half-written would read as the app having lost it.
 */
const MAX_MESSAGE = 2000;

/**
 * Both halves are optional and independent — stars without a note, or a note
 * without stars — so the only real rule is that something was actually sent.
 */
const feedbackSchema = z
  .object({
    rating: z.number().int().min(1).max(5).optional(),
    message: z.string().trim().min(1).max(MAX_MESSAGE).optional(),
    appVersion: z.string().max(32).optional(),
    platform: z.string().max(32).optional(),
  })
  .refine((d) => d.rating !== undefined || d.message !== undefined, {
    message: "Send a rating, a message, or both.",
  });

// POST /feedback
router.post(
  "/",
  authMiddleware,
  async (req, res: Response): Promise<void> => {
    const { accountId } = req as AuthRequest;
    const body = parseOrThrow(feedbackSchema, req.body);

    const feedback = await prisma.feedback.create({
      data: {
        accountId,
        rating: body.rating ?? null,
        message: body.message ?? null,
        appVersion: body.appVersion ?? null,
        platform: body.platform ?? null,
      },
      select: { id: true, createdAt: true },
    });

    res.status(201).json(feedback);
  }
);

export default router;
