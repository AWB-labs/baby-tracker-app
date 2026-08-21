import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import prisma from "../../lib/adminPrisma";
import { signAdminToken } from "../../lib/adminJwt";
import { unauthorized, AppError } from "../../lib/httpError";
import { parseOrThrow } from "../../lib/validate";
import { adminAuthMiddleware, AdminRequest } from "../../middleware/adminAuth";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * A brake on password guessing, per source address.
 *
 * In memory on purpose: it is one small object, it costs no database round
 * trip on the request an attacker is hammering, and there is exactly one
 * admin login to protect. On a serverless host each container keeps its own
 * copy, which weakens it — that is why the window is generous and the
 * lockout long enough to be felt even when it only lands some of the time.
 */
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; firstAt: number }>();

function throttle(key: string): void {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || now - record.firstAt > WINDOW_MS) return;
  if (record.count >= MAX_ATTEMPTS) {
    const minutes = Math.ceil((WINDOW_MS - (now - record.firstAt)) / 60_000);
    throw new AppError(
      429,
      `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      "rate_limited"
    );
  }
}

function recordFailure(key: string): void {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || now - record.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now });
    return;
  }
  record.count += 1;
}

// POST /admin/api/auth/login
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const { email: rawEmail, password } = parseOrThrow(loginSchema, req.body);
  const email = rawEmail.trim().toLowerCase();
  const key = req.ip ?? "unknown";

  throttle(key);

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  const wrong = unauthorized("Those details don't match.", "bad_credentials");

  if (!admin) {
    // Still hash something, so a missing account doesn't answer measurably
    // faster than a wrong password and hand out a list of valid admin emails.
    await bcrypt.compare(password, "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
    recordFailure(key);
    throw wrong;
  }

  if (!(await bcrypt.compare(password, admin.password))) {
    recordFailure(key);
    throw wrong;
  }

  attempts.delete(key);
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  res.json({
    token: signAdminToken({ adminId: admin.id, email: admin.email }),
    admin: { id: admin.id, name: admin.name, email: admin.email },
  });
});

// GET /admin/api/auth/me — lets the dashboard confirm a stored token on load
router.get("/me", adminAuthMiddleware, async (req, res: Response): Promise<void> => {
  const { adminId } = req as AdminRequest;
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { id: true, name: true, email: true, lastLoginAt: true },
  });
  if (!admin) throw unauthorized("Not allowed.", "admin_unauthorized");
  res.json({ admin });
});

export default router;
