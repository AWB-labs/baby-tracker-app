import app from "../src/app";

/**
 * Vercel serverless entrypoint.
 *
 * Vercel turns each file under `api/` into a function and owns the HTTP socket,
 * so this exports the Express app rather than calling `listen()`. All paths are
 * rewritten here by vercel.json, which is why the app's own routes still start
 * at `/auth`, `/logs` and so on.
 *
 * The reminder scheduler deliberately does not start here: a serverless
 * function only exists for the duration of a request, so an in-process timer
 * would be killed the moment the response is sent. Set REMINDER_MODE=cron and
 * drive /internal/reminders/tick from an external scheduler.
 */
export default app;
