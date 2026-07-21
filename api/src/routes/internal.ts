import { Router, Request, Response } from "express";
import { runReminderTick } from "../lib/reminderScheduler";
import { unauthorized } from "../lib/httpError";

const router = Router();

/**
 * POST /internal/reminders/tick
 *
 * Runs one pass of the reminder scheduler and reports how many fired.
 *
 * Exists so the scheduler doesn't force the API onto always-on hosting: a free
 * tier that sleeps can be driven by any external cron (GitHub Actions,
 * cron-job.org, Supabase pg_cron), and the same request doubles as the
 * keep-alive that stops the instance idling out.
 *
 * Not part of the public API — it's guarded by a shared secret rather than a
 * user session, because no user is making this call.
 */
router.post("/reminders/tick", async (req: Request, res: Response): Promise<void> => {
  const expected = process.env.CRON_SECRET;

  // Without a configured secret this endpoint would let anyone on the internet
  // trigger notification sends, so it stays closed rather than open by default.
  if (!expected) {
    throw unauthorized(
      "Scheduled reminders aren't configured on this server.",
      "cron_disabled"
    );
  }

  const provided =
    req.get("x-cron-secret") ??
    (req.get("authorization")?.startsWith("Bearer ")
      ? req.get("authorization")!.slice(7)
      : undefined);

  if (provided !== expected) {
    throw unauthorized("Not allowed.", "bad_cron_secret");
  }

  const fired = await runReminderTick();
  res.json({ ok: true, fired });
});

export default router;
