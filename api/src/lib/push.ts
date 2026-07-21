import prisma from "./prisma";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Send a batch of notifications through Expo's push service.
 *
 * Tokens that Expo reports as unregistered are deleted: a device that has
 * uninstalled the app or revoked permission would otherwise be retried on every
 * scheduler tick forever.
 */
export async function sendPushNotifications(
  messages: PushMessage[]
): Promise<void> {
  if (messages.length === 0) return;

  // Expo accepts at most 100 messages per request.
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      });

      if (!res.ok) {
        console.error(`[push] Expo responded ${res.status}`);
        continue;
      }

      const payload = (await res.json()) as { data?: ExpoTicket[] };
      const tickets = payload.data ?? [];
      const dead: string[] = [];
      tickets.forEach((ticket, index) => {
        if (
          ticket.status === "error" &&
          ticket.details?.error === "DeviceNotRegistered"
        ) {
          dead.push(batch[index].to);
        } else if (ticket.status === "error") {
          console.error(`[push] ${ticket.message ?? "unknown error"}`);
        }
      });

      if (dead.length > 0) {
        await prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
        console.log(`[push] pruned ${dead.length} unregistered token(s)`);
      }
    } catch (err) {
      // A push failure must never take down the scheduler.
      console.error("[push] send failed:", err);
    }
  }
}
