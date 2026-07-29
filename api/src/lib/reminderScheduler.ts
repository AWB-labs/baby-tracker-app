import prisma from "./prisma";
import { sendPushNotifications, PushMessage } from "./push";
import {
  isAllowedDay,
  localDayKey,
  localMinutesOfDay,
  reminderMeta,
} from "./reminders";

const TICK_MS = 60_000;

/**
 * How late a reminder may still be delivered, in minutes.
 *
 * Ticks arrive on a schedule that can slip — the external cron runs every 30
 * minutes and GitHub's scheduler is explicitly best-effort — so "fire the
 * moment we notice it's past 9am" has to tolerate some lateness. It must not
 * tolerate unlimited lateness: if the ticker were down all morning, a 9am
 * vitamin reminder arriving at 8pm is worse than not arriving, because the
 * obvious reading of it is that the dose is still owed.
 */
const FIRE_WINDOW_MINUTES = 180;

/**
 * Decide whether a scheduled reminder is due.
 *
 * Everything is judged on the caregiver's local clock, not the server's: 9am
 * means 9am where the parent is, and "already sent today" means their today.
 * Three conditions, all of which must hold:
 *
 *   - today is one of the reminder's days
 *   - their local time is at or past the scheduled time, but not more than
 *     FIRE_WINDOW_MINUTES past it
 *   - nothing has been sent for this reminder on their current local day
 *
 * Pure and exported so the timing rules can be tested without a database.
 */
export function shouldFire(input: {
  timeOfDay: number;
  daysOfWeek: string | null;
  tzOffsetMinutes: number | null;
  lastNotifiedAt: Date | null;
  now: Date;
}): boolean {
  const { timeOfDay, daysOfWeek, tzOffsetMinutes, lastNotifiedAt, now } = input;

  if (!isAllowedDay({ daysOfWeek, tzOffsetMinutes, now })) return false;

  const nowMinutes = localMinutesOfDay(now, tzOffsetMinutes);
  if (nowMinutes < timeOfDay) return false;
  if (nowMinutes - timeOfDay > FIRE_WINDOW_MINUTES) return false;

  // One notification per local day. Without this the reminder would repeat on
  // every tick for the whole of the firing window.
  if (
    lastNotifiedAt &&
    localDayKey(lastNotifiedAt, tzOffsetMinutes) === localDayKey(now, tzOffsetMinutes)
  ) {
    return false;
  }

  return true;
}

export async function runReminderTick(now: Date = new Date()): Promise<number> {
  const reminders = await prisma.reminder.findMany({
    where: {
      enabled: true,
      account: { notificationsEnabled: true },
    },
    select: {
      id: true,
      babyId: true,
      accountId: true,
      type: true,
      label: true,
      timeOfDay: true,
      daysOfWeek: true,
      tzOffsetMinutes: true,
      lastNotifiedAt: true,
      createdAt: true,
      baby: { select: { name: true } },
      account: {
        select: { pushTokens: { select: { token: true } } },
      },
    },
  });

  if (reminders.length === 0) return 0;

  const messages: PushMessage[] = [];
  const firedIds: number[] = [];

  for (const reminder of reminders) {
    const tokens = reminder.account.pushTokens.map((t) => t.token);
    if (tokens.length === 0) continue;

    // Purely a question about the clock now, so no per-reminder query: a tick
    // is one read of the reminder table however many reminders exist.
    const due = shouldFire({
      timeOfDay: reminder.timeOfDay,
      daysOfWeek: reminder.daysOfWeek,
      tzOffsetMinutes: reminder.tzOffsetMinutes,
      lastNotifiedAt: reminder.lastNotifiedAt,
      now,
    });
    if (!due) continue;

    const meta = reminderMeta(reminder.type);
    const name = reminder.label || meta?.label || reminder.type;
    const icon = meta?.icon ?? "⏰";

    for (const token of tokens) {
      messages.push({
        to: token,
        title: `${icon} ${name} reminder`,
        body: `Time for ${reminder.baby.name}'s ${name.toLowerCase()}.`,
        data: { babyId: reminder.babyId, reminderId: reminder.id },
      });
    }
    firedIds.push(reminder.id);
  }

  if (firedIds.length === 0) return 0;

  // Stamp before sending: a push failure should not cause the same reminder to
  // be retried every minute.
  await prisma.reminder.updateMany({
    where: { id: { in: firedIds } },
    data: { lastNotifiedAt: now },
  });

  await sendPushNotifications(messages);
  return firedIds.length;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export function startReminderScheduler(): void {
  if (timer) return;
  // Overlapping ticks would double-send, so the loop is re-armed only after the
  // previous pass settles rather than on a fixed interval.
  const loop = async () => {
    try {
      const fired = await runReminderTick();
      if (fired > 0) console.log(`[reminders] fired ${fired} reminder(s)`);
    } catch (err) {
      console.error("[reminders] tick failed:", err);
    } finally {
      timer = setTimeout(loop, TICK_MS);
    }
  };
  timer = setTimeout(loop, TICK_MS);
  console.log(`[reminders] scheduler started (every ${TICK_MS / 1000}s)`);
}

export function stopReminderScheduler(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
