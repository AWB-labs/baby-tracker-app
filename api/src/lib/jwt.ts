import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export interface JwtPayload {
  accountId: number;
  email: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, SECRET) as Partial<JwtPayload> & { typ?: string };

  // A caregiver token has an account behind it and no `typ`. Both checks are
  // here because ADMIN_JWT_SECRET is allowed to be unset, in which case admin
  // tokens are signed with this same key and would otherwise verify: the
  // request would then run with `accountId: undefined`, which is not access to
  // anybody's data but does turn every route it touches into a 500. Rejecting
  // the token outright is both the correct answer and the safer one.
  if (decoded?.typ === "admin" || typeof decoded?.accountId !== "number") {
    throw new jwt.JsonWebTokenError("not a caregiver token");
  }

  return decoded as JwtPayload;
}
