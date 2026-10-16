import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink, organization } from "better-auth/plugins";
import { schema } from "@clicky/db";
import { db } from "./db";
import { sendEmail } from "./email";
import { env } from "./env";

export const auth = betterAuth({
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  socialProviders:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {},
  plugins: [
    organization({
      async sendInvitationEmail({ id, email, organization, inviter }) {
        await sendEmail({
          to: email,
          subject: `${inviter.user.name} invited you to ${organization.name} on Clicky`,
          text: `Accept the invitation: ${env.APP_URL}/invite/${id}`,
        });
      },
    }),
    magicLink({
      async sendMagicLink({ email, url }) {
        await sendEmail({ to: email, subject: "Your Clicky sign-in link", text: url });
      },
    }),
    nextCookies(),
  ],
});

export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
