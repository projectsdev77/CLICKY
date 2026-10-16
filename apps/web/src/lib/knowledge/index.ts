import "server-only";
import { and, desc, eq, knowledgeChunk, knowledgeSource, sql } from "@clicky/db";
import { db } from "../db";
import { chunkText, extractPage } from "./extract";
import { safeFetchHtml } from "./safe-fetch";

const MAX_PAGES = 30;

type ChunkInput = { url: string | null; title: string; text: string };

async function replaceChunks(sourceId: string, projectId: string, pages: ChunkInput[]) {
  const rows = pages.flatMap((page) =>
    chunkText(page.text).map((content) => ({
      id: crypto.randomUUID(),
      sourceId,
      projectId,
      url: page.url,
      title: page.title,
      content,
    })),
  );
  await db.transaction(async (tx) => {
    await tx.delete(knowledgeChunk).where(eq(knowledgeChunk.sourceId, sourceId));
    for (let i = 0; i < rows.length; i += 200) await tx.insert(knowledgeChunk).values(rows.slice(i, i + 200));
  });
  return rows.length;
}

/** Crawls a help center from its start URL (same site, under the same path), up to MAX_PAGES. */
async function crawl(startUrl: string): Promise<ChunkInput[]> {
  const start = new URL(startUrl);
  const scope = start.pathname.endsWith("/") ? start.pathname : start.pathname.replace(/[^/]*$/, "");
  const queue = [start.toString()];
  const seen = new Set(queue);
  const pages: ChunkInput[] = [];
  while (queue.length && pages.length < MAX_PAGES) {
    const next = queue.shift()!;
    let fetched;
    try {
      fetched = await safeFetchHtml(next);
    } catch (error) {
      if (pages.length === 0) throw error; // start page must work; skip broken pages later on
      continue;
    }
    if (!fetched) continue;
    const page = extractPage(fetched.html, fetched.url);
    if (page.text.length > 50) pages.push({ url: fetched.url, title: page.title, text: page.text });
    for (const link of page.links) {
      const url = new URL(link);
      url.search = "";
      const key = url.toString();
      if (url.origin === start.origin && url.pathname.startsWith(scope) && !seen.has(key)) {
        seen.add(key);
        queue.push(key);
      }
    }
  }
  return pages;
}

/** (Re)builds a URL source. Runs in the background after the request that queued it. */
export async function syncUrlSource(sourceId: string) {
  const [source] = await db.select().from(knowledgeSource).where(eq(knowledgeSource.id, sourceId));
  if (!source?.url) return;
  await db.update(knowledgeSource).set({ status: "syncing", error: null }).where(eq(knowledgeSource.id, sourceId));
  try {
    const pages = await crawl(source.url);
    if (pages.length === 0) throw new Error("No readable pages found at that address");
    await replaceChunks(source.id, source.projectId, pages);
    await db
      .update(knowledgeSource)
      .set({ status: "ready", pageCount: pages.length, lastSyncedAt: new Date(), title: source.title || pages[0]!.title })
      .where(eq(knowledgeSource.id, sourceId));
  } catch (error) {
    await db
      .update(knowledgeSource)
      .set({ status: "error", error: error instanceof Error ? error.message : "Sync failed" })
      .where(eq(knowledgeSource.id, sourceId));
  }
}

export async function saveTextSource(sourceId: string, projectId: string, title: string, text: string) {
  await replaceChunks(sourceId, projectId, [{ url: null, title, text }]);
  await db
    .update(knowledgeSource)
    .set({ status: "ready", pageCount: 1, lastSyncedAt: new Date(), error: null })
    .where(eq(knowledgeSource.id, sourceId));
}

export type KnowledgeHit = { title: string | null; url: string | null; content: string };

/**
 * Full-text search over a project's knowledge base. Words are OR-ed so natural
 * questions still match; ts_rank_cd favours chunks that match more of them.
 * (Embedding search can be layered on later; see docs/SPEC.md.)
 */
export async function searchKnowledge(projectId: string, query: string, limit = 4): Promise<KnowledgeHit[]> {
  const tsquery = sql`to_tsquery('english', replace(plainto_tsquery('english', ${query})::text, ' & ', ' | '))`;
  const rank = sql<number>`ts_rank_cd(${knowledgeChunk.searchVector}, ${tsquery})`;
  const rows = await db
    .select({ title: knowledgeChunk.title, url: knowledgeChunk.url, content: knowledgeChunk.content, rank })
    .from(knowledgeChunk)
    .where(and(eq(knowledgeChunk.projectId, projectId), sql`${knowledgeChunk.searchVector} @@ ${tsquery}`))
    .orderBy(desc(rank))
    .limit(limit);
  return rows.filter((r) => r.rank > 0.01).map(({ title, url, content }) => ({ title, url, content }));
}
