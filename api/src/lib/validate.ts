import { ZodError, ZodIssue, ZodTypeAny, z } from "zod";
import { badRequest } from "./httpError";

/** "babyId" -> "Baby id", "feverCelsius" -> "Fever celsius" */
function humanizeField(path: (string | number)[]): string {
  const key = path.filter((p) => typeof p === "string").pop();
  if (!key) return "That value";
  const spaced = String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Zod's stock messages ("Required", "Invalid email") read like a stack trace to
 * a parent at 3am. Custom messages written in the schemas are kept as-is;
 * only the generic ones get rewritten to name the field and say what to do.
 */
function messageForIssue(issue: ZodIssue): string {
  const field = humanizeField(issue.path);

  switch (issue.code) {
    case "invalid_type":
      if (issue.received === "undefined" || issue.received === "null") {
        return `${field} is required.`;
      }
      return `${field} isn't in the right format.`;
    case "too_small": {
      if (issue.type === "string") {
        return issue.minimum === 1
          ? `${field} can't be empty.`
          : `${field} must be at least ${issue.minimum} characters.`;
      }
      return `${field} must be at least ${issue.minimum}.`;
    }
    case "too_big": {
      if (issue.type === "string") {
        return `${field} must be ${issue.maximum} characters or fewer.`;
      }
      return `${field} must be ${issue.maximum} or less.`;
    }
    case "invalid_string":
      if (issue.validation === "email") {
        return "That doesn't look like a valid email address.";
      }
      return issue.message;
    case "invalid_enum_value":
      return `${field} must be one of: ${issue.options.join(", ")}.`;
    default:
      return issue.message;
  }
}

export function friendlyZodMessage(error: ZodError): string {
  const issue = error.errors[0];
  if (!issue) return "Some of those details aren't valid.";
  return messageForIssue(issue);
}

/**
 * Validate and return the parsed value, or throw an AppError carrying a message
 * that is safe to show the user. Lets routes read as a straight line instead of
 * repeating the same safeParse/respond dance.
 */
export function parseOrThrow<T extends ZodTypeAny>(
  schema: T,
  data: unknown
): z.infer<T> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw badRequest(friendlyZodMessage(parsed.error), "validation");
  }
  return parsed.data;
}

/** Parse a route/query param that must be a positive integer id. */
export function parseId(raw: unknown, label = "id"): number {
  const value = parseInt(String(raw), 10);
  if (isNaN(value) || value <= 0) {
    throw badRequest(`That ${label} isn't valid.`, "bad_id");
  }
  return value;
}
