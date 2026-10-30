import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink, organization, twoFactor } from "better-auth/plugins";
import { and, count, eq, member, ne, schema } from "@clicky/db";
import { db } from "./db";
import { sendEmail } from "./email";
import { env } from "./env";

export const auth = betterAuth({
  appName: "Clicky",
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
    async sendResetPassword({ user, url }) {
      await sendEmail({
        to: user.email,
        subject: "Reset your Clicky password",
        text: `Someone (hopefully you) asked to reset your Clicky password. This link works for one hour:\n\n${url}\n\nIf it wasn't you, ignore this email; your password stays the same.`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, url }) {
      await sendEmail({ to: user.email, subject: "Confirm your email for Clicky", text: `Confirm your email address:\n\n${url}` });
    },
  },
  user: {
    deleteUser: {
      enabled: true,
      async beforeDelete(user) {
        // Don't leave a team without an owner: owners must hand over or delete the organization first.
        const owned = await db.select({ organizationId: member.organizationId }).from(member).where(and(eq(member.userId, user.id), eq(member.role, "owner")));
        for (const { organizationId } of owned) {
          const [others] = await db
            .select({ n: count() })
            .from(member)
            .where(and(eq(member.organizationId, organizationId), ne(member.userId, user.id), eq(member.role, "owner")));
          const [anyone] = await db
            .select({ n: count() })
            .from(member)
            .where(and(eq(member.organizationId, organizationId), ne(member.userId, user.id)));
          if ((anyone?.n ?? 0) > 0 && (others?.n ?? 0) === 0) {
            throw new APIError("BAD_REQUEST", {
              message: "You're the only owner of a team. Make someone else an owner, or delete the organization, first.",
            });
          }
        }
      },
    },
  },
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
    twoFactor({ issuer: "Clicky" }),
    nextCookies(),
  ],
});

export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
