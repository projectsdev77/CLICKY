import "server-only";
import { and, conversation, endUser, eq, event, lt, project, sql } from "@clicky/db";
import { parseProjectSettings } from "@clicky/shared";
import { db } from "./db";

/**
 * Deletes conversations (with their messages and agent runs) and signals older
 * than each project's retention period, plus end users with nothing left.
 * Run daily (see vercel.json and /api/cron/retention).
 */
export async function purgeExpiredData(now = new Date()) {
  const projects = await db.select({ id: project.id, settings: project.settings }).from(project);
  let conversations = 0;
  let events = 0;
  for (const p of projects) {
    const days = parseProjectSettings(p.settings).data.retentionDays;
    const cutoff = new Date(now.getTime() - days * 86_400_000);
    conversations += (
      await db
        .delete(conversation)
        .where(and(eq(conversation.projectId, p.id), lt(conversation.createdAt, cutoff)))
        .returning({ id: conversation.id })
    ).length;
    events += (
      await db.delete(event).where(and(eq(event.projectId, p.id), lt(event.createdAt, cutoff))).returning({ id: event.id })
    ).length;
    await db
      .delete(endUser)
      .where(
        and(
          eq(endUser.projectId, p.id),
          lt(endUser.lastSeenAt, cutoff),
          sql`not exists (select 1 from ${conversation} c where c.end_user_id = ${endUser.id})`,
        ),
      );
  }
  return { conversations, events };
}

/** Deletes everything Clicky holds about one of a project's users (a privacy request). */
export async function deleteEndUserData(projectId: string, externalUserId: string) {
  const deleted = await db
    .delete(endUser)
    .where(and(eq(endUser.projectId, projectId), eq(endUser.externalId, externalUserId)))
    .returning({ id: endUser.id });
  return deleted.length;
}
