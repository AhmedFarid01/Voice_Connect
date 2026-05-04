import nodemailer, { type Transporter } from "nodemailer";

interface MailArgs {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null;
  if (!host || !port) return null;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
  return transporter;
}

export async function sendMail(args: MailArgs): Promise<{ delivered: boolean }> {
  const t = getTransporter();
  const from = process.env.MAIL_FROM || "Lumen <no-reply@lumen.local>";

  if (!t) {
    // No SMTP wired up — log it so dev can still copy the link from the console.
    console.log("───── [mailer:console] ─────");
    console.log("From:", from);
    console.log("To:", args.to);
    console.log("Subject:", args.subject);
    console.log(args.text);
    console.log("───────────────────────────");
    return { delivered: false };
  }

  await t.sendMail({
    from,
    to: args.to,
    subject: args.subject,
    text: args.text,
    html: args.html,
  });
  return { delivered: true };
}

export function isMailConfigured() {
  return !!getTransporter();
}
