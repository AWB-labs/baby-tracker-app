import { Router, Request, Response } from "express";
import prisma from "../../lib/adminPrisma";
import { parseId } from "../../lib/validate";
import { notFound } from "../../lib/httpError";

const router = Router();

const DAY_MS = 86_400_000;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

type Sort = "logs" | "recent" | "created" | "name";

/**
 * GET /admin/api/babies
 *
 * Every baby on the service with its caregivers and how much has been recorded
 * about it. The counts that decide the order — total logs, last log, logs this
 * week — come from three grouped queries over the whole table rather than a
 * per-baby lookup, so sorting doesn't degrade as the table grows.
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const now = new Date();
  const since7d = new Date(now.getTime() - 7 * DAY_MS);
  const q = String(req.query.q ?? "").trim();
  const sort = (String(req.query.sort ?? "logs") as Sort) ?? "logs";
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(String(req.query.pageSize ?? DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  );

  const [babies, totals, recents, weekly] = await Promise.all([
    prisma.baby.findMany({
      where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
      select: { id: true, name: true, createdAt: true },
    }),
    prisma.activityLog.groupBy({ by: ["babyId"], _count: { _all: true } }),
    prisma.activityLog.groupBy({ by: ["babyId"], _max: { createdAt: true } }),
    prisma.activityLog.groupBy({
      by: ["babyId"],
      where: { createdAt: { gte: since7d } },
      _count: { _all: true },
    }),
  ]);

  const totalById = new Map(totals.map((t) => [t.babyId, t._count._all]));
  const lastById = new Map(recents.map((r) => [r.babyId, r._max.createdAt]));
  const weekById = new Map(weekly.map((w) => [w.babyId, w._count._all]));

  const rows = babies.map((baby) => ({
    id: baby.id,
    name: baby.name,
    createdAt: baby.createdAt,
    logCount: totalById.get(baby.id) ?? 0,
    lastLogAt: lastById.get(baby.id) ?? null,
    logs7d: weekById.get(baby.id) ?? 0,
  }));

  rows.sort((a, b) => {
    switch (sort) {
      case "recent":
        return (b.lastLogAt?.getTime() ?? 0) - (a.lastLogAt?.getTime() ?? 0);
      case "created":
        return b.createdAt.getTime() - a.createdAt.getTime();
      case "name":
        return a.name.localeCompare(b.name);
      default:
        return b.logCount - a.logCount;
    }
  });

  const total = rows.length;
  const slice = rows.slice((page - 1) * pageSize, page * pageSize);
  const details = await hydrate(slice.map((r) => r.id));

  res.json({
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    babies: slice.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      lastLogAt: row.lastLogAt?.toISOString() ?? null,
      ...(details.get(row.id) ?? {}),
    })),
  });
});

async function hydrate(ids: number[]) {
  if (ids.length === 0) return new Map<number, unknown>();

  const babies = await prisma.baby.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      gender: true,
      dob: true,
      avatarEmoji: true,
      avatarColor: true,
      milkBalanceAdjustmentMl: true,
      diaperStockCount: true,
      ownerAccountId: true,
      _count: { select: { invites: true, vaccines: true, bagItems: true, activeTimers: true } },
      members: {
        orderBy: { createdAt: "asc" },
        select: {
          role: true,
          relation: true,
          relationNote: true,
          createdAt: true,
          account: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  return new Map(
    babies.map((baby) => [
      baby.id,
      {
        gender: baby.gender,
        dob: baby.dob?.toISOString() ?? null,
        avatarEmoji: baby.avatarEmoji,
        avatarColor: baby.avatarColor,
        milkBalanceAdjustmentMl: baby.milkBalanceAdjustmentMl,
        diaperStockCount: baby.diaperStockCount,
        pendingInvites: baby._count.invites,
        vaccineRows: baby._count.vaccines,
        bagItems: baby._count.bagItems,
        runningTimers: baby._count.activeTimers,
        ownerAccountId: baby.ownerAccountId,
        caregivers: baby.members.map((m) => ({
          id: m.account.id,
          name: m.account.name,
          email: m.account.email,
          role: m.role,
          relation: m.relation,
          relationNote: m.relationNote,
          joinedAt: m.createdAt.toISOString(),
        })),
      },
    ])
  );
}

// GET /admin/api/babies/:id
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const id = parseId(req.params.id, "baby");

  const [baby, logTypes, recentLogs, timers, vaccines, invites, reminders, growth] =
    await Promise.all([
      prisma.baby.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          gender: true,
          dob: true,
          avatarEmoji: true,
          avatarColor: true,
          createdAt: true,
          milkBalanceAdjustmentMl: true,
          diaperStockCount: true,
          owner: { select: { id: true, name: true, email: true } },
          members: {
            orderBy: { createdAt: "asc" },
            select: {
              role: true,
              relation: true,
              relationNote: true,
              createdAt: true,
              account: { select: { id: true, name: true, email: true } },
            },
          },
          _count: { select: { logs: true, bagItems: true } },
        },
      }),
      prisma.activityLog.groupBy({
        by: ["type"],
        where: { babyId: id },
        _count: { _all: true },
      }),
      prisma.activityLog.findMany({
        where: { babyId: id },
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          type: true,
          startTime: true,
          endTime: true,
          durationMinutes: true,
          amountMl: true,
          diaperStatus: true,
          enteredByName: true,
          createdAt: true,
        },
      }),
      prisma.activeTimer.findMany({
        where: { babyId: id },
        select: { type: true, startTime: true, side: true, enteredByName: true },
      }),
      prisma.vaccine.findMany({
        where: { babyId: id },
        orderBy: { monthNumber: "asc" },
        select: { monthNumber: true, givenAt: true },
      }),
      prisma.babyInvite.findMany({
        where: { babyId: id },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          createdAt: true,
          token: true,
        },
      }),
      prisma.reminder.findMany({
        where: { babyId: id },
        select: {
          id: true,
          type: true,
          label: true,
          enabled: true,
          timeOfDay: true,
          account: { select: { id: true, name: true } },
        },
      }),
      prisma.activityLog.findMany({
        where: { babyId: id, type: "growth" },
        orderBy: { startTime: "asc" },
        select: {
          startTime: true,
          weightKg: true,
          heightCm: true,
          headCircumferenceCm: true,
        },
      }),
    ]);

  if (!baby) throw notFound("No such baby.", "no_baby");

  // `members` is re-shaped into `caregivers` and `_count` is flattened, so
  // neither is spread through as well.
  const { members, _count, ...babyFields } = baby;

  res.json({
    baby: {
      ...babyFields,
      caregivers: members.map((m) => ({
        id: m.account.id,
        name: m.account.name,
        email: m.account.email,
        role: m.role,
        relation: m.relation,
        relationNote: m.relationNote,
        joinedAt: m.createdAt,
      })),
      logCount: _count.logs,
      bagItems: _count.bagItems,
    },
    logTypes: logTypes
      .map((t) => ({ key: t.type, count: t._count._all }))
      .sort((a, b) => b.count - a.count),
    recentLogs,
    timers,
    vaccines,
    // A link invite's token is the credential itself — the dashboard only
    // needs to know which flavour an invite is, never the code.
    invites: invites.map(({ token, ...rest }) => ({ ...rest, kind: token ? "link" : "email" })),
    reminders,
    growth,
  });
});

export default router;
