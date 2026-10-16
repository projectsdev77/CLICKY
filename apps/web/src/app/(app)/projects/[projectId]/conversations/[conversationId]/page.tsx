import { notFound } from "next/navigation";
import { and, asc, conversation, endUser, eq, message } from "@clicky/db";
import { POINT_MARKER_RE } from "@clicky/shared";
import { db } from "@/lib/db";
import { requireProject } from "@/lib/dal";
import { Card } from "@/components/ui";

/** Shows a reply with its pointing markers as small chips. */
function Reply({ text }: { text: string }) {
  const parts = text.split(POINT_MARKER_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="mx-0.5 rounded bg-brand/10 px-1 font-mono text-[10px] text-brand" title="Pointed at this element">
            ➜ {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

export default async function ConversationPage({
  params,
}: PageProps<"/projects/[projectId]/conversations/[conversationId]">) {
  const { projectId, conversationId } = await params;
  const { project } = await requireProject(projectId);
  const [convo] = await db
    .select({ conversation, endUser })
    .from(conversation)
    .innerJoin(endUser, eq(conversation.endUserId, endUser.id))
    .where(and(eq(conversation.id, conversationId), eq(conversation.projectId, project.id)));
  if (!convo) notFound();
  const messages = await db
    .select()
    .from(message)
    .where(eq(message.conversationId, conversationId))
    .orderBy(asc(message.createdAt));

  return (
    <Card
      title="Conversation"
      description={`${convo.endUser.externalId ? `User ${convo.endUser.externalId}` : "Anonymous user"} · started ${convo.conversation.createdAt.toLocaleString()}`}
    >
      <ol className="space-y-4">
        {messages.map((m) => (
          <li key={m.id} className={m.role === "user" ? "text-sm" : "rounded-md bg-background p-3 text-sm"}>
            <p className="mb-1 text-xs text-muted">
              {m.role === "user" ? `User${m.inputMode === "voice" ? " (voice)" : ""}` : "Clicky"} · {m.pageUrl}
            </p>
            {m.role === "assistant" ? <Reply text={m.content} /> : m.content}
          </li>
        ))}
      </ol>
    </Card>
  );
}
