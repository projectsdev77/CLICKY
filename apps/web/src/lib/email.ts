import "server-only";
import { Resend } from "resend";
import { env } from "./env";

let resend: Resend | null = null;

/** Sends an email through Resend, or writes it to the server log when no key is configured (local development). */
export async function sendEmail(message: { to: string; subject: string; text: string }) {
  if (!env.RESEND_API_KEY) {
    console.info(`[email] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`);
    return;
  }
  resend ??= new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({ from: env.EMAIL_FROM, to: message.to, subject: message.subject, text: message.text });
  if (error) {
    console.error("[email] send failed", error);
    throw new Error("Could not send email");
  }
}
