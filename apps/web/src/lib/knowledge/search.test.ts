import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, knowledgeChunk, knowledgeSource, organization, project, eq } from "@clicky/db";

/**
 * Runs against a real Postgres (DATABASE_URL, default local dev database) because
 * search is SQL. Skipped when no database is reachable.
 */
const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/clicky";
const db = createDb(url);
const reachable = await db.execute("select 1").then(() => true, () => false);

process.env.DATABASE_URL = url;
const { searchKnowledge } = await import("./index");

describe.skipIf(!reachable)("searchKnowledge", () => {
  const orgId = `test-org-${Date.now()}`;
  const projectId = `test-project-${Date.now()}`;

  beforeAll(async () => {
    await db.insert(organization).values({ id: orgId, name: "Test", slug: orgId, createdAt: new Date() });
    await db.insert(project).values({ id: projectId, organizationId: orgId, name: "T", publicKey: `pk_${Date.now()}test`.padEnd(27, "x").slice(0, 27) });
    await db.insert(knowledgeSource).values({ id: `${projectId}-s`, projectId, type: "text", title: "Docs" });
    await db.insert(knowledgeChunk).values([
      { id: `${projectId}-1`, sourceId: `${projectId}-s`, projectId, title: "Exporting reports", content: "Choose a format, then click Export to download your reports as CSV." },
      { id: `${projectId}-2`, sourceId: `${projectId}-s`, projectId, title: "Billing", content: "Switch plans from the Billing page." },
    ]);
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, orgId));
  });

  it("ranks the most relevant chunk first for a natural question", async () => {
    const hits = await searchKnowledge(projectId, "How do I export my reports?");
    expect(hits[0]?.title).toBe("Exporting reports");
  });

  it("returns nothing for stopword-only or unrelated questions", async () => {
    expect(await searchKnowledge(projectId, "how do I")).toEqual([]);
    expect(await searchKnowledge(projectId, "zebra giraffe")).toEqual([]);
  });

  it("only searches the given project", async () => {
    expect(await searchKnowledge("some-other-project", "export reports")).toEqual([]);
  });
});
