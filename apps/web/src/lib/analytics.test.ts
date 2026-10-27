import { describe, expect, it } from "vitest";
import { createDb } from "@clicky/db";

/** Smoke-tests every analytics query against the real database (skipped if unreachable). */
const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/clicky";
const reachable = await createDb(url).execute("select 1").then(() => true, () => false);
process.env.DATABASE_URL = url;
const analytics = await import("./analytics");

describe.skipIf(!reachable)("analytics queries", () => {
  it("run without errors for an empty project", async () => {
    const id = "no-such-project";
    expect((await analytics.getOverview(id, 30)).conversations).toBe(0);
    expect(await analytics.getDailyConversations(id, 7)).toHaveLength(7);
    expect(await analytics.getTopics(id, 30)).toEqual([]);
    expect(await analytics.getKnowledgeGaps(id, 30)).toEqual([]);
    expect(await analytics.getPageFriction(id, 30)).toEqual([]);
    expect(await analytics.getProblemElements(id, 30)).toEqual([]);
  });
});
