import Link from "next/link";
import { and, conversation, count, desc, endUser, eq, gte, message, sql, topic } from "@clicky/db";
import { parseRange, rangeStart } from "@/lib/analytics";
import { RangeFilter } from "@/components/range-filter";
import { db } from "@/lib/db";
import { requireProject } from "@/lib/dal";
import { getPlanState } from "@/lib/billing";
import { Card } from "@/components/ui";

export default async function ConversationsPage({ params, searchParams }: PageProps<"/projects/[projectId]/conversations">) {
  const { projectId } = await params;
  const query = await searchParams;
  let days = parseRange(query.days);
  const topicId = typeof query.topic === "string" ? query.topic : undefined;
  const rating = query.rating === "up" ? 1 : query.rating === "down" ? -1 : undefined;
  const { project } = await requireProject(projectId);
  const { plan } = await getPlanState(project.organizationId);
  days = Math.min(days, plan.limits.analyticsDays) as typeof days;
  const since = rangeStart(days);
  const [topicRow] = topicId
    ? await db.select().from(topic).where(and(eq(topic.id, topicId), eq(topic.projectId, project.id)))
    : [];
  const filters = [eq(conversation.projectId, project.id), gte(conversation.createdAt, since)];
  if (rating) filters.push(eq(conversation.feedback, rating));
  if (topicRow) {
    filters.push(
      sql`exists (select 1 from ${message} tm where tm.conversation_id = ${conversation.id} and tm.topic_id = ${topicRow.id})`,
    );
  }
  const base = `/projects/${project.id}/conversations`;
  const keep = { ...(topicRow ? { topic: topicRow.id } : {}), ...(query.rating ? { rating: String(query.rating) } : {}) };
  const rows = await db
    .select({
      id: conversation.id,
      createdAt: conversation.createdAt,
      entryUrl: conversation.entryUrl,
      externalId: endUser.externalId,
      messages: count(message.id),
      firstQuestion: sql<string | null>`(array_agg(${message.content} order by ${message.createdAt}) filter (where ${message.role} = 'user'))[1]`,
      voice: sql<boolean>`bool_or(${message.inputMode} = 'voice')`,
      feedback: conversation.feedback,
    })
    .from(conversation)
    .innerJoin(endUser, eq(conversation.endUserId, endUser.id))
    .leftJoin(message, eq(message.conversationId, conversation.id))
    .where(and(...filters))
    .groupBy(conversation.id, endUser.externalId)
    .orderBy(desc(conversation.createdAt))
    .limit(100);

  const chip = (label: string, href: string, active: boolean) => (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs ${active ? "border-brand text-brand" : "border-border text-muted hover:text-foreground"}`}
    >
      {label}
    </Link>
  );
  const withParams = (extra: Record<string, string | undefined>) => {
    const merged: Record<string, string> = { days: String(days) };
    for (const [k, v] of Object.entries({ ...keep, ...extra })) if (v) merged[k] = v;
    return `${base}?${new URLSearchParams(merged)}`;
  };

  return (
    <>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <RangeFilter maxDays={plan.limits.analyticsDays} days={days} basePath={base} extra={keep} />
      <div className="flex gap-2">
        {chip("All", withParams({ rating: undefined }), !rating)}
        {chip("👍 Helpful", withParams({ rating: "up" }), rating === 1)}
        {chip("👎 Not helpful", withParams({ rating: "down" }), rating === -1)}
        {topicRow && chip(`Topic: ${topicRow.label} ✕`, withParams({ topic: undefined }), true)}
      </div>
    </div>
    <Card title="Conversations" description="What your users asked Clicky, newest first.">
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No conversations yet. They show up here as soon as someone asks Clicky something.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/projects/${project.id}/conversations/${c.id}`} className="block py-3 hover:bg-background">
                <p className="truncate text-sm font-medium">{c.firstQuestion ?? "(no question)"}</p>
                <p className="truncate text-xs text-muted">
                  {c.externalId ? `User ${c.externalId}` : "Anonymous"} · {c.messages} messages
                  {c.voice ? " · voice" : ""}
                  {c.feedback === 1 ? " · 👍" : c.feedback === -1 ? " · 👎" : ""} · {c.entryUrl} · {c.createdAt.toLocaleString()}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
    </>
  );
}
