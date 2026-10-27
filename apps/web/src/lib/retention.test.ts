import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conversation, createDb, endUser, eq, event, organization, project } from "@clicky/db";

const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/clicky";
const db = createDb(url);
const reachable = await db.execute("select 1").then(() => true, () => false);
process.env.DATABASE_URL = url;
const { deleteEndUserData, purgeExpiredData } = await import("./retention");

describe.skipIf(!reachable)("retention", () => {
  const id = `ret-${Date.now()}`;
  const old = new Date(Date.now() - 40 * 86_400_000);

  beforeAll(async () => {
    await db.insert(organization).values({ id, name: "R", slug: id, createdAt: new Date() });
    await db.insert(project).values({ id, organizationId: id, name: "R", publicKey: `pk_${id}`.slice(0, 27), settings: { data: { retentionDays: 30 } } });
    await db.insert(endUser).values([
      { id: `${id}-a`, projectId: id, anonymousId: `${id}-a`, externalId: "user_a", lastSeenAt: old },
      { id: `${id}-b`, projectId: id, anonymousId: `${id}-b`, externalId: "user_b" },
    ]);
    await db.insert(conversation).values([
      { id: `${id}-old`, projectId: id, endUserId: `${id}-a`, createdAt: old },
      { id: `${id}-new`, projectId: id, endUserId: `${id}-b` },
    ]);
    await db.insert(event).values([
      { id: `${id}-e1`, projectId: id, sessionId: "s", type: "pageview", path: "/", createdAt: old },
      { id: `${id}-e2`, projectId: id, sessionId: "s", type: "pageview", path: "/" },
    ]);
  });
  afterAll(() => db.delete(organization).where(eq(organization.id, id)));

  it("deletes data older than the project's retention period", async () => {
    await purgeExpiredData();
    const convos = await db.select().from(conversation).where(eq(conversation.projectId, id));
    expect(convos.map((c) => c.id)).toEqual([`${id}-new`]);
    expect((await db.select().from(event).where(eq(event.projectId, id))).map((e) => e.id)).toEqual([`${id}-e2`]);
    expect((await db.select().from(endUser).where(eq(endUser.projectId, id))).map((u) => u.id)).toEqual([`${id}-b`]);
  });

  it("deletes everything for one user on request", async () => {
    expect(await deleteEndUserData(id, "user_b")).toBe(1);
    expect(await db.select().from(conversation).where(eq(conversation.projectId, id))).toEqual([]);
    expect(await deleteEndUserData(id, "nobody")).toBe(0);
  });
});
