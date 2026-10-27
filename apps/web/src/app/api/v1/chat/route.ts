import type Anthropic from "@anthropic-ai/sdk";
import { agentRun, and, conversation, desc, eq, message } from "@clicky/db";
import { chatRequestSchema, isPathBlocked, parseProjectSettings } from "@clicky/shared";
import { db } from "@/lib/db";
import { searchKnowledge } from "@/lib/knowledge";
import { buildSystemPrompt, buildUserTurn } from "@/lib/assistant/prompt";
import { runStep } from "@/lib/assistant/run";
import { sseResponse } from "@/lib/sse";
import {
  authorizeProject,
  cleanUrl,
  enforceRateLimit,
  parseBody,
  preflight,
  sdkErrorResponse,
  upsertEndUser,
} from "@/lib/sdk-request";

export const OPTIONS = preflight;

const HISTORY_MESSAGES = 12;

/** Answers a question about the current page (and, in agent mode, may start acting). Streams server-sent events. */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  let setup;
  try {
    const body = await parseBody(request, chatRequestSchema);
    const proj = await authorizeProject(body.projectKey, origin);
    enforceRateLimit(`chat:${proj.id}:${body.anonymousId}`, 20);
    enforceRateLimit(`chat:${proj.id}`, 600);
    const user = await upsertEndUser(proj.id, body);
    const pageUrl = cleanUrl(body.page.url);

    let convo = body.conversationId
      ? (
          await db
            .select()
            .from(conversation)
            .where(
              and(
                eq(conversation.id, body.conversationId),
                eq(conversation.projectId, proj.id),
                eq(conversation.endUserId, user.id),
              ),
            )
            .limit(1)
        )[0]
      : undefined;
    if (!convo) {
      [convo] = await db
        .insert(conversation)
        .values({ id: crypto.randomUUID(), projectId: proj.id, endUserId: user.id, mode: "ask", entryUrl: pageUrl })
        .returning();
    }

    const [recent, knowledge] = await Promise.all([
      db
        .select({ role: message.role, content: message.content })
        .from(message)
        .where(eq(message.conversationId, convo!.id))
        .orderBy(desc(message.createdAt))
        .limit(HISTORY_MESSAGES),
      searchKnowledge(proj.id, body.message),
    ]);
    // Earlier turns as plain text (no old page snapshots); must start with a user message.
    const history = recent.reverse();
    while (history[0]?.role === "assistant") history.shift();

    await db.insert(message).values({
      id: crypto.randomUUID(),
      conversationId: convo!.id,
      role: "user",
      content: body.message,
      inputMode: body.inputMode,
      pageUrl,
    });
    setup = { body, proj, convo: convo!, user, history, knowledge, pageUrl };
  } catch (error) {
    return sdkErrorResponse(error, origin);
  }

  const { body, proj, convo, user, history, knowledge, pageUrl } = setup;
  const settings = parseProjectSettings(proj.settings);
  const page = {
    url: pageUrl,
    title: body.page.title,
    snapshot: body.page.snapshot,
    actionsBlocked: isPathBlocked(settings.behavior.blockedPaths, new URL(pageUrl, "http://x").pathname),
  };
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: buildUserTurn({ question: body.message, inputMode: body.inputMode, page, knowledge }) },
  ];
  const [run] = await db
    .insert(agentRun)
    .values({
      id: crypto.randomUUID(),
      conversationId: convo.id,
      projectId: proj.id,
      endUserId: user.id,
      status: "running",
      inputMode: body.inputMode,
      messages: JSON.stringify(messages),
    })
    .returning();

  return sseResponse(origin, async (send) => {
    send({ type: "meta", conversationId: convo.id, runId: run!.id });
    await runStep({
      run: run!,
      messages,
      system: buildSystemPrompt({
        assistantName: settings.appearance.assistantName,
        appName: proj.name,
        mode: settings.behavior.mode,
        customInstructions: settings.behavior.customInstructions,
      }),
      mode: settings.behavior.mode,
      pageUrl,
      send,
      signal: request.signal,
      stub: { question: body.message, snapshot: body.page.snapshot, knowledge, lastResults: null },
    });
  });
}
