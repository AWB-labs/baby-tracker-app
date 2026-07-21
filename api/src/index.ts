import "dotenv/config";
import app from "./app";
import { startReminderScheduler } from "./lib/reminderScheduler";

/**
 * Long-running entrypoint — local development, Render, a VPS.
 *
 * Serverless hosts don't use this file at all; they import the app directly and
 * the platform owns the listening socket. Keeping the two apart means the same
 * codebase deploys either way with no conditional branches inside the app.
 */
const PORT = parseInt(process.env.PORT || "3001");

/**
 * How reminders get evaluated.
 *
 *   inline — an in-process loop. Only fires while this process is awake, so it
 *            suits a machine you keep running (local dev, a VPS).
 *   cron   — nothing runs in-process; an external scheduler POSTs to
 *            /internal/reminders/tick. Required on serverless, and on free
 *            hosting that sleeps, since neither can tick itself.
 */
const REMINDER_MODE = (process.env.REMINDER_MODE ?? "inline").toLowerCase();

app.listen(PORT, () => {
  console.log(`Baby Tracker API running on http://localhost:${PORT}`);
  if (REMINDER_MODE === "inline") {
    startReminderScheduler();
  } else {
    console.log(
      `[reminders] mode=${REMINDER_MODE} — waiting for POST /internal/reminders/tick`
    );
  }
});

export default app;
