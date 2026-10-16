import Link from "next/link";
import { conversation, count, desc, endUser, eq, message, sql } from "@clicky/db";
import { db } from "@/lib/db";
import { requireProject } from "@/lib/dal";
import { Card } from "@/components/ui";

export default async function ConversationsPage({ params }: PageProps<"/projects/[projectId]/conversations">) {
  const { projectId } = await params;
  const { project } = await requireProject(projectId);
  const rows = await db
    .select({
      id: conversation.id,
      createdAt: conversation.createdAt,
      entryUrl: conversation.entryUrl,
      externalId: endUser.externalId,
      messages: count(message.id),
      firstQuestion: sql<string | null>`(array_agg(${message.content} order by ${message.createdAt}) filter (where ${message.role} = 'user'))[1]`,
      voice: sql<boolean>`bool_or(${message.inputMode} = 'voice')`,
    })
    .from(conversation)
    .innerJoin(endUser, eq(conversation.endUserId, endUser.id))
    .leftJoin(message, eq(message.conversationId, conversation.id))
    .where(eq(conversation.projectId, project.id))
    .groupBy(conversation.id, endUser.externalId)
    .orderBy(desc(conversation.createdAt))
    .limit(100);

  return (
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
                  {c.voice ? " · voice" : ""} · {c.entryUrl} · {c.createdAt.toLocaleString()}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
