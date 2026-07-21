import prisma from "./prisma";
import { sendPushNotifications, PushMessage } from "./push";
import { formatInterval, reminderLogType, reminderMeta } from "./reminders";

const TICK_MS = 60_000;

/**
 * Decide whether a reminder is due.
 *
 * The anchor is the last time the watched activity happened for the baby —
 * shared across caregivers, so anyone logging a feed pushes everyone's feed
 * reminder forward. With no such activity yet we count from when the reminder
 * was created, otherwise a brand-new reminder would fire immediately.
 *
 * Pure and exported so the timing rules can be tested without a database.
 */
export function shouldFire(input: {
  anchor: Date;
  intervalMinutes: number;
  lastNotifiedAt: Date | null;
  now: Date;
}): boolean {
  const { anchor, intervalMinutes, lastNotifiedAt, now } = input;
  const due = new Date(anchor.getTime() + intervalMinutes * 60_000);
  if (now < due) return false;
  // Already notified for this window. Without this the reminder would fire
  // again on every tick until someone logs the activity.
  if (lastNotifiedAt && lastNotifiedAt >= due) return false;
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
      intervalMinutes: true,
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

    const logType = reminderLogType(reminder.type);

    let anchor: Date;
    if (logType) {
      const last = await prisma.activityLog.findFirst({
        where: { babyId: reminder.babyId, type: logType },
        orderBy: { startTime: "desc" },
        select: { startTime: true },
      });
      anchor = last?.startTime ?? reminder.createdAt;
    } else {
      // A custom reminder has no activity to watch, so each notification is
      // itself the anchor for the next one.
      anchor = reminder.lastNotifiedAt ?? reminder.createdAt;
    }

    const due = shouldFire({
      anchor,
      intervalMinutes: reminder.intervalMinutes,
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
        body: logType
          ? `It has been ${formatInterval(reminder.intervalMinutes)} since ${reminder.baby.name}'s last ${name.toLowerCase()}.`
          : `Reminder for ${reminder.baby.name}: ${name}.`,
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
