import axios from "axios";

/** Codes the API sends so the app can react, not just display. */
export type ApiErrorCode =
  | "unauthorized"
  | "session_expired"
  | "validation"
  | "duplicate"
  | "gone"
  | "server_error"
  | "network"
  | "timeout"
  | (string & {});

export interface FriendlyError {
  message: string;
  code?: ApiErrorCode;
  /** True when signing in again is what would fix it. */
  isAuth: boolean;
}

const GENERIC = "Something went wrong. Please try again.";

/**
 * Turn anything thrown by the API layer into one sentence worth showing.
 *
 * The API already writes its own human messages, so those are preferred; this
 * covers the cases it can't reach the user for — no connection, a timeout, or a
 * response that isn't shaped the way we expect. A raw status code or stack
 * trace must never come out of here.
 */
export function toFriendlyError(err: unknown): FriendlyError {
  if (axios.isAxiosError(err)) {
    if (err.code === "ECONNABORTED") {
      return {
        message: "That took too long. Check your connection and try again.",
        code: "timeout",
        isAuth: false,
      };
    }

    if (!err.response) {
      return {
        message:
          "Can't reach the server. Check your connection and try again.",
        code: "network",
        isAuth: false,
      };
    }

    const { status, data } = err.response;
    const payload = data as { error?: unknown; code?: unknown } | undefined;
    const apiMessage =
      typeof payload?.error === "string" && payload.error.trim()
        ? payload.error.trim()
        : null;
    const code =
      typeof payload?.code === "string" ? (payload.code as ApiErrorCode) : undefined;
    const isAuth = status === 401;

    if (apiMessage) return { message: apiMessage, code, isAuth };

    // The server didn't give us a message — never show the bare status.
    if (status === 401) {
      return {
        message: "Your session has expired. Please sign in again.",
        code: "session_expired",
        isAuth: true,
      };
    }
    if (status === 403) {
      return { message: "You don't have access to that.", code, isAuth: false };
    }
    if (status === 404) {
      return { message: "That's no longer there.", code: "gone", isAuth: false };
    }
    if (status >= 500) {
      return {
        message: "The server is having a moment. Please try again shortly.",
        code: "server_error",
        isAuth: false,
      };
    }
    return { message: GENERIC, code, isAuth: false };
  }

  if (err instanceof Error && err.message) {
    // Only surface our own thrown messages, never a runtime error's internals.
    return { message: GENERIC, isAuth: false };
  }

  return { message: GENERIC, isAuth: false };
}

/** Convenience for `catch (e) { toast.error(getErrorMessage(e)) }`. */
export function getErrorMessage(err: unknown): string {
  return toFriendlyError(err).message;
}
