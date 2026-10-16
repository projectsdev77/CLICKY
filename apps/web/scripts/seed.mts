/**
 * Seeds a local demo account so you can develop without clicking through sign-up:
 *   email: demo@clicky.test / password: password123
 * with an "Acme" organization and a project wired to the demo app (http://localhost:5173).
 * Safe to re-run.
 */
import { hashPassword } from "better-auth/crypto";
import { account, createDb, eq, member, organization, project, user } from "@clicky/db";
import { defaultProjectSettings } from "@clicky/shared";

const db = createDb(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/clicky");

const USER_ID = "seed-user";
const ORG_ID = "seed-org";
const PROJECT_KEY = "pk_demoDemoDemoDemoDemoDemo";

const [existing] = await db.select().from(user).where(eq(user.id, USER_ID));
if (!existing) {
  const now = new Date();
  await db.insert(user).values({ id: USER_ID, name: "Demo User", email: "demo@clicky.test", emailVerified: true });
  await db.insert(account).values({
    id: "seed-account",
    accountId: USER_ID,
    providerId: "credential",
    userId: USER_ID,
    password: await hashPassword("password123"),
    updatedAt: now,
  });
  await db.insert(organization).values({ id: ORG_ID, name: "Acme", slug: "acme-demo", createdAt: now });
  await db.insert(member).values({ id: "seed-member", organizationId: ORG_ID, userId: USER_ID, role: "owner", createdAt: now });
  await db.insert(project).values({
    id: "seed-project",
    organizationId: ORG_ID,
    name: "Acme Analytics (demo)",
    publicKey: PROJECT_KEY,
    allowedOrigins: ["http://localhost:5173"],
    settings: defaultProjectSettings(),
  });
  console.log("Seeded demo@clicky.test / password123");
} else {
  console.log("Seed data already present");
}
process.exit(0);
