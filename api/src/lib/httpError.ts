/**
 * An error that is safe to show a parent.
 *
 * Anything thrown that is NOT an AppError is treated as a bug: it gets logged
 * in full and the client receives a generic apology. That way a Prisma stack
 * trace or a null-dereference can never reach the app as "Internal server
 * error 500".
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Machine-readable hint so the app can react (e.g. sign the user out). */
    public readonly code?: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, code?: string) =>
  new AppError(400, message, code);

export const unauthorized = (message = "Please sign in again.", code = "unauthorized") =>
  new AppError(401, message, code);

export const forbidden = (message: string, code?: string) =>
  new AppError(403, message, code);

export const notFound = (message: string, code?: string) =>
  new AppError(404, message, code);

export const conflict = (message: string, code?: string) =>
  new AppError(409, message, code);

/**
 * Turn a Prisma failure into something a person can act on. These are the only
 * database errors that are really the user's doing; everything else is a bug on
 * our side and stays generic.
 */
export function friendlyPrismaMessage(err: unknown): AppError | null {
  const e = err as { code?: string; meta?: { target?: string[] | string } };
  if (typeof e?.code !== "string" || !e.code.startsWith("P")) return null;

  const target = Array.isArray(e.meta?.target)
    ? e.meta?.target.join(", ")
    : e.meta?.target;

  switch (e.code) {
    case "P2002":
      return conflict(
        target?.includes("email")
          ? "That email address is already in use."
          : "That already exists.",
        "duplicate"
      );
    case "P2003":
      return badRequest("That refers to something that no longer exists.", "fk");
    case "P2025":
      return notFound("That item no longer exists — it may have been deleted.", "gone");
    case "P1001":
    case "P1002":
      return new AppError(
        503,
        "Can't reach the server right now. Please try again in a moment.",
        "db_unreachable"
      );
    default:
      return null;
  }
}
