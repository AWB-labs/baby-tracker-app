import apiClient from "./client";

export interface FeedbackInput {
  /** 1-5. Omitted when someone sends a note without picking a star. */
  rating?: number;
  /** Omitted when someone sends stars on their own. */
  message?: string;
  appVersion?: string;
  platform?: string;
}

/**
 * Send a rating and/or a note — see api/src/routes/feedback.ts.
 *
 * The server requires at least one of the two, which is also the only rule
 * the sheet enforces before enabling its send button.
 */
export async function sendFeedback(input: FeedbackInput): Promise<void> {
  await apiClient.post("/feedback", input);
}
