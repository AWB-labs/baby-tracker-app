import { Router, Request, Response } from "express";
import prisma from "../../lib/adminPrisma";
import { parseId } from "../../lib/validate";
import { notFound } from "../../lib/httpError";
import { ACTIVE_WINDOW_HOURS } from "../../lib/presence";
import { isActive, lastActivityByAccount } from "../../lib/adminMetrics";

const router = Router();

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

type Sort = "recent" | "joined" | "logs" | "name";

/**
 * GET /admin/api/users
 *
 * Every caregiver, with the babies they look after and when they were last
 * seen. Paged, searched and sorted on the server rather than shipped whole and
 * filtered in the browser: the shape of this list is the same at twenty
 * accounts and at twenty thousand, and only the visible page is ever hydrated
 * with its babies.
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const now = new Date();
  const q = String(req.query.q ?? "").trim();
  const status = String(req.query.status ?? "all");
  const sort = (String(req.query.sort ?? "recent") as Sort) ?? "recent";
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(String(req.query.pageSize ?? DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  );

  const [activity, matches] = await Promise.all([
    lastActivityByAccount(),
    prisma.account.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      select: { id: true, name: true, createdAt: true },
    }),
  ]);

  let rows = matches.map((account) => {
    const entry = activity.get(account.id);
    const lastActivityAt = entry?.lastActivityAt ?? account.createdAt;
    return {
      id: account.id,
      name: account.name,
      createdAt: account.createdAt,
      lastActivityAt,
      source: entry?.source ?? "signup",
      logCount: entry?.logCount ?? 0,
      active: isActive(lastActivityAt, now),
    };
  });

  if (status === "active") rows = rows.filter((r) => r.active);
  if (status === "dormant") rows = rows.filter((r) => !r.active);

  rows.sort((a, b) => {
    switch (sort) {
      case "joined":
        return b.createdAt.getTime() - a.createdAt.getTime();
      case "logs":
        return b.logCount - a.logCount;
      case "name":
        return a.name.localeCompare(b.name);
      default:
        return b.lastActivityAt.getTime() - a.lastActivityAt.getTime();
    }
  });

  const total = rows.length;
  const slice = rows.slice((page - 1) * pageSize, page * pageSize);
  const details = await hydrate(slice.map((r) => r.id));

  res.json({
    activeWindowHours: ACTIVE_WINDOW_HOURS,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    counts: {
      active: rows.filter((r) => r.active).length,
      dormant: rows.filter((r) => !r.active).length,
    },
    users: slice.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      lastActivityAt: row.lastActivityAt.toISOString(),
      ...(details.get(row.id) ?? { email: "", babies: [] }),
    })),
  });
});

/** Everything about the page's accounts that isn't needed to sort them. */
async function hydrate(ids: number[]) {
  if (ids.length === 0) return new Map<number, unknown>();

  const accounts = await prisma.account.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      email: true,
      relation: true,
      relationNote: true,
      unitSystem: true,
      themeColor: true,
      notificationsEnabled: true,
      lastSeenAt: true,
      _count: { select: { profiles: true, pushTokens: true, reminders: true } },
      memberships: {
        orderBy: { createdAt: "asc" },
        select: {
          role: true,
          relation: true,
          relationNote: true,
          createdAt: true,
          baby: {
            select: {
              id: true,
              name: true,
              gender: true,
              dob: true,
              avatarEmoji: true,
              avatarColor: true,
              createdAt: true,
              _count: { select: { logs: true, members: true } },
            },
          },
        },
      },
    },
  });

  return new Map(
    accounts.map((account) => [
      account.id,
      {
        email: account.email,
        relation: account.relation,
        relationNote: account.relationNote,
        unitSystem: account.unitSystem,
        themeColor: account.themeColor,
        notificationsEnabled: account.notificationsEnabled,
        lastSeenAt: account.lastSeenAt?.toISOString() ?? null,
        profileCount: account._count.profiles,
        pushTokenCount: account._count.pushTokens,
        reminderCount: account._count.reminders,
        babies: account.memberships.map((m) => ({
          id: m.baby.id,
          name: m.baby.name,
          gender: m.baby.gender,
          dob: m.baby.dob?.toISOString() ?? null,
          avatarEmoji: m.baby.avatarEmoji,
          avatarColor: m.baby.avatarColor,
          createdAt: m.baby.createdAt.toISOString(),
          role: m.role,
          relation: m.relation,
          relationNote: m.relationNote,
          joinedAt: m.createdAt.toISOString(),
          logCount: m.baby._count.logs,
          caregiverCount: m.baby._count.members,
        })),
      },
    ])
  );
}

/**
 * GET /admin/api/users/:id
 *
 * One caregiver in full — for the times a support question is about a specific
 * person rather than a trend.
 */
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const id = parseId(req.params.id, "user");
  const now = new Date();

  const [account, activity, recentLogs, pushTokens, reminders, invitesSent, logTypes] =
    await Promise.all([
      prisma.account.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          lastSeenAt: true,
          relation: true,
          relationNote: true,
          unitSystem: true,
          themeColor: true,
          notificationsEnabled: true,
          profiles: {
            orderBy: { createdAt: "asc" },
            select: { id: true, displayName: true, createdAt: true },
          },
          memberships: {
            orderBy: { createdAt: "asc" },
            select: {
              role: true,
              relation: true,
              relationNote: true,
              createdAt: true,
              baby: {
                select: {
                  id: true,
                  name: true,
                  gender: true,
                  dob: true,
                  avatarEmoji: true,
                  avatarColor: true,
                  createdAt: true,
                  _count: { select: { logs: true, members: true } },
                },
              },
            },
          },
        },
      }),
      lastActivityByAccount(),
      prisma.activityLog.findMany({
        where: { accountId: id },
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          type: true,
          startTime: true,
          createdAt: true,
          enteredByName: true,
          baby: { select: { id: true, name: true } },
        },
      }),
      prisma.pushToken.findMany({
        where: { accountId: id },
        select: { platform: true, createdAt: true, updatedAt: true },
      }),
      prisma.reminder.findMany({
        where: { accountId: id },
        select: {
          id: true,
          type: true,
          label: true,
          enabled: true,
          timeOfDay: true,
          daysOfWeek: true,
          everyDays: true,
          lastNotifiedAt: true,
          baby: { select: { id: true, name: true } },
        },
      }),
      prisma.babyInvite.count({ where: { invitedByAccountId: id } }),
      prisma.activityLog.groupBy({
        by: ["type"],
        where: { accountId: id },
        _count: { _all: true },
      }),
    ]);

  if (!account) throw notFound("No such user.", "no_user");

  const entry = activity.get(id);
  const lastActivityAt = entry?.lastActivityAt ?? account.createdAt;
  // Memberships are re-shaped into `babies` just below; keeping the raw
  // relation as well would send the same rows down twice.
  const { memberships, ...rest } = account;

  res.json({
    user: {
      ...rest,
      lastActivityAt: lastActivityAt.toISOString(),
      source: entry?.source ?? "signup",
      active: isActive(lastActivityAt, now),
      logCount: entry?.logCount ?? 0,
      invitesSent,
      babies: memberships.map((m) => ({
        id: m.baby.id,
        name: m.baby.name,
        gender: m.baby.gender,
        dob: m.baby.dob,
        avatarEmoji: m.baby.avatarEmoji,
        avatarColor: m.baby.avatarColor,
        createdAt: m.baby.createdAt,
        role: m.role,
        relation: m.relation,
        relationNote: m.relationNote,
        joinedAt: m.createdAt,
        logCount: m.baby._count.logs,
        caregiverCount: m.baby._count.members,
      })),
    },
    logTypes: logTypes
      .map((t) => ({ key: t.type, count: t._count._all }))
      .sort((a, b) => b.count - a.count),
    recentLogs,
    pushTokens,
    reminders,
  });
});

export default router;
