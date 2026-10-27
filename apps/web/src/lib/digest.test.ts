import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conversation, createDb, endUser, eq, message, organization, project } from "@clicky/db";

const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/clicky";
const db = createDb(url);
const reachable = await db.execute("select 1").then(() => true, () => false);
process.env.DATABASE_URL = url;
process.env.CLICKY_ASSISTANT_PROVIDER = "stub";
const { buildDigest } = await import("./digest");

describe.skipIf(!reachable)("buildDigest", () => {
  const id = `dig-${Date.now()}`;
  beforeAll(async () => {
    await db.insert(organization).values({ id, name: "D", slug: id, createdAt: new Date() });
    await db.insert(project).values({ id, organizationId: id, name: "Digest App", publicKey: `pk_${id}`.slice(0, 27) });
    await db.insert(endUser).values({ id, projectId: id, anonymousId: id });
    await db.insert(conversation).values({ id, projectId: id, endUserId: id, feedback: 1 });
    await db.insert(message).values({ id, conversationId: id, role: "user", content: "How do I export?", answered: false });
  });
  afterAll(() => db.delete(organization).where(eq(organization.id, id)));

  it("summarises the week", async () => {
    const digest = await buildDigest(id);
    expect(digest?.subject).toBe("Clicky weekly: 1 conversation in Digest App");
    expect(digest?.text).toContain("• 100% rated helpful");
    expect(digest?.text).toContain("“How do I export?”");
  });

  it("skips quiet projects", async () => {
    await db.delete(conversation).where(eq(conversation.id, id));
    expect(await buildDigest(id)).toBeNull();
  });
});
