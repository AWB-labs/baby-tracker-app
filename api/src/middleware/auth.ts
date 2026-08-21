import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/jwt";
import { touchAccount } from "../lib/presence";

export interface AuthRequest extends Request {
  accountId: number;
  accountEmail: string;
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res
      .status(401)
      .json({ error: "Please sign in to continue.", code: "unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    (req as AuthRequest).accountId = payload.accountId;
    (req as AuthRequest).accountEmail = payload.email;
    // Every authenticated request is evidence the app is in use, whether it
    // writes anything or not. Fire-and-forget and throttled — see touchAccount.
    touchAccount(payload.accountId);
    next();
  } catch {
    res.status(401).json({
      error: "Your session has expired. Please sign in again.",
      code: "session_expired",
    });
  }
}
