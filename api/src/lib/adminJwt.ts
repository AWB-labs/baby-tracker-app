import jwt from "jsonwebtoken";

/**
 * Admin sessions are signed separately from caregiver sessions.
 *
 * Two things keep them from being interchangeable. The secret is its own when
 * ADMIN_JWT_SECRET is set, and the payload carries `typ: "admin"`, which is
 * checked on the way back in — so even on a server where both fall back to
 * JWT_SECRET, a caregiver's 30-day token cannot open the dashboard and an
 * admin token cannot be replayed against /logs or /babies.
 */
const SECRET =
  process.env.ADMIN_JWT_SECRET ||
  process.env.JWT_SECRET ||
  "dev-secret-change-me";

/**
 * Twelve hours, against the app's thirty days. A dashboard session sits on a
 * desktop browser and sees every family's data at once; it should not survive
 * a long weekend.
 */
const TTL = "12h";

export interface AdminJwtPayload {
  adminId: number;
  email: string;
  typ: "admin";
}

export function signAdminToken(payload: Omit<AdminJwtPayload, "typ">): string {
  return jwt.sign({ ...payload, typ: "admin" }, SECRET, { expiresIn: TTL });
}

export function verifyAdminToken(token: string): AdminJwtPayload {
  const decoded = jwt.verify(token, SECRET) as Partial<AdminJwtPayload>;
  if (decoded?.typ !== "admin" || typeof decoded.adminId !== "number") {
    throw new Error("not an admin token");
  }
  return decoded as AdminJwtPayload;
}
