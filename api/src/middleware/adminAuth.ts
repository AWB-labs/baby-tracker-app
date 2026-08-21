import { Request, Response, NextFunction } from "express";
import { verifyAdminToken } from "../lib/adminJwt";

export interface AdminRequest extends Request {
  adminId: number;
  adminEmail: string;
}

/**
 * The gate on everything under /admin/api except the login endpoint itself.
 *
 * Unlike the caregiver middleware this one says nothing helpful: the dashboard
 * is not a product surface, and a bare "Not allowed." is all an unauthenticated
 * caller ever needs to learn from it. The 401 code is still distinct so the
 * dashboard can tell "log in again" from "something broke".
 */
export function adminAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not allowed.", code: "admin_unauthorized" });
    return;
  }

  try {
    const payload = verifyAdminToken(header.slice(7));
    (req as AdminRequest).adminId = payload.adminId;
    (req as AdminRequest).adminEmail = payload.email;
    next();
  } catch {
    res
      .status(401)
      .json({ error: "Your admin session has expired.", code: "admin_session_expired" });
  }
}
