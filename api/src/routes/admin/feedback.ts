import { Router, Request, Response } from "express";
import prisma from "../../lib/adminPrisma";

const router = Router();

/** One screenful at a time; the dashboard pages with `offset`. */
const PAGE_SIZE = 50;

/**
 * GET /admin/api/feedback
 *
 * Everything sent from the in-app prompt, newest first, with the author
 * attached where they still have an account.
 *
 * The star average deliberately counts only entries that carry a rating: a
 * note sent without touching the stars is not a zero, and averaging it as one
 * would drag the number down every time somebody asks for a feature.
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10) || 0);
  const [rows, total, ratingAgg, distribution] = await Promise.all([
    prisma.feedback.findMany({
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: PAGE_SIZE,
      select: {
        id: true,
        rating: true,
        message: true,
        appVersion: true,
        platform: true,
        createdAt: true,
        account: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.feedback.count(),
    prisma.feedback.aggregate({
      _avg: { rating: true },
      _count: { rating: true },
      where: { rating: { not: null } },
    }),
    prisma.feedback.groupBy({
      by: ["rating"],
      _count: { _all: true },
      where: { rating: { not: null } },
    }),
  ]);

  res.json({
    generatedAt: new Date().toISOString(),
    total,
    pageSize: PAGE_SIZE,
    offset,
    averageRating: ratingAgg._avg.rating,
    ratedCount: ratingAgg._count.rating,
    distribution: [1, 2, 3, 4, 5].map((star) => ({
      star,
      count:
        distribution.find((d) => d.rating === star)?._count._all ?? 0,
    })),
    items: rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      message: row.message,
      appVersion: row.appVersion,
      platform: row.platform,
      createdAt: row.createdAt.toISOString(),
      // Null once the author has deleted their account — the note outlives
      // them on purpose, so the dashboard shows it without an author rather
      // than hiding it.
      account: row.account,
    })),
  });
});

/**
 * There is deliberately no write here — no "mark as read".
 *
 * The whole /admin/api surface is read-only on purpose (see the reasoning in
 * ./index.ts), and a route that flips `Feedback.handled` would be the first
 * thing to break that, for a convenience rather than a need. The column
 * exists so the ability can be added later as an explicit decision; until
 * then every note simply stays listed, newest first.
 */

export default router;
