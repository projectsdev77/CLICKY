import { notFound } from "next/navigation";
import { agentAction, agentRun, and, asc, conversation, endUser, eq, message } from "@clicky/db";
import { POINT_MARKER_RE } from "@clicky/shared";
import { db } from "@/lib/db";
import { requireProject } from "@/lib/dal";
import { Card } from "@/components/ui";

const ACTION_STATUS: Record<string, string> = {
  done: "done",
  failed: "failed",
  declined: "user said no",
  blocked: "blocked by settings",
  skipped: "skipped",
  timeout: "user didn't do it in time",
};

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
  const [messages, actions] = await Promise.all([
    db.select().from(message).where(eq(message.conversationId, conversationId)).orderBy(asc(message.createdAt)),
    db
      .select({ action: agentAction })
      .from(agentAction)
      .innerJoin(agentRun, eq(agentAction.runId, agentRun.id))
      .where(eq(agentRun.conversationId, conversationId))
      .orderBy(asc(agentAction.createdAt)),
  ]);
  const timeline = [
    ...messages.map((m) => ({ kind: "message" as const, at: m.createdAt, m })),
    ...actions.map(({ action }) => ({ kind: "action" as const, at: action.createdAt, a: action })),
  ].sort((x, y) => x.at.getTime() - y.at.getTime());

  return (
    <Card
      title="Conversation"
      description={`${convo.endUser.externalId ? `User ${convo.endUser.externalId}` : "Anonymous user"} · started ${convo.conversation.createdAt.toLocaleString()}`}
    >
      <ol className="space-y-4">
        {timeline.map((item) =>
          item.kind === "message" ? (
            <li key={item.m.id} className={item.m.role === "user" ? "text-sm" : "rounded-md bg-background p-3 text-sm"}>
              <p className="mb-1 text-xs text-muted">
                {item.m.role === "user" ? `User${item.m.inputMode === "voice" ? " (voice)" : ""}` : "Clicky"} · {item.m.pageUrl}
              </p>
              {item.m.role === "assistant" ? <Reply text={item.m.content} /> : item.m.content}
            </li>
          ) : (
            <li key={item.a.id} className="ml-4 border-l-2 border-brand/40 pl-3 text-xs">
              <span className="font-medium">{item.a.description}</span>
              <span className="text-muted">
                {" "}
                · {ACTION_STATUS[item.a.status ?? ""] ?? "not finished"}
                {item.a.needsConfirmation ? " · asked first" : ""}
              </span>
              {item.a.status && item.a.status !== "done" && item.a.output && (
                <span className="block text-muted">{item.a.output}</span>
              )}
            </li>
          ),
        )}
      </ol>
    </Card>
  );
}
