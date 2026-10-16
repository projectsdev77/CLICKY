import "server-only";

/**
 * Placeholder mailer. Until an email provider (Resend) is configured, messages
 * are written to the server log so magic links and invites still work locally.
 */
export async function sendEmail(message: { to: string; subject: string; text: string }) {
  console.info(`[email] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`);
}
