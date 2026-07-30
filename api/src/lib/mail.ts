import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outbound email, over plain SMTP.
 *
 * Nothing in this app has ever sent an email before — sign-in is a custom
 * Express API with its own Account table, not Supabase Auth, so there is no
 * Supabase email feature to turn on for this. SMTP is provider-agnostic on
 * purpose: the same four env vars work against Gmail's SMTP for a quick test,
 * or a real transactional sender later (Resend, Postmark, SendGrid, or
 * Supabase's own SMTP relay if the project has one) — swapping providers is a
 * config change here, never a code change.
 *
 * The transporter is built once and reused, the same reasoning as the Prisma
 * client singleton: a fresh SMTP connection per email is a handshake this
 * doesn't need to pay twice.
 */
let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    throw new Error(
      "Email isn't configured: set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS."
    );
  }

  transporter = nodemailer.createTransport({
    host,
    port: parseInt(port, 10),
    // 465 is the implicit-TLS port; everything else (587, 25) starts in plain
    // text and upgrades via STARTTLS, which nodemailer does on its own.
    secure: parseInt(port, 10) === 465,
    auth: { user, pass },
  });

  return transporter;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send one email.
 *
 * Throws on failure rather than swallowing it the way sendPushNotifications
 * does — a missed push is a shrug, but a password-reset email that silently
 * never sent leaves someone locked out with no way to know why. The caller
 * (the forgot-password route) decides what the user sees.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await getTransporter().sendMail({
    from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
