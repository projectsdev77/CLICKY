import { and, conversation, desc, eq, message } from "@clicky/db";
import { chatRequestSchema, parseProjectSettings, type ChatEvent } from "@clicky/shared";
import { db } from "@/lib/db";
import { searchKnowledge } from "@/lib/knowledge";
import { streamReply } from "@/lib/assistant";
import {
  authorizeProject,
  cleanUrl,
  corsHeaders,
  enforceRateLimit,
  parseBody,
  preflight,
  sdkErrorResponse,
  upsertEndUser,
} from "@/lib/sdk-request";

export const OPTIONS = preflight;

const HISTORY_MESSAGES = 12;

/** Answers one question about the current page, streaming the reply as server-sent events. */
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

    const [history, knowledge] = await Promise.all([
      db
        .select({ role: message.role, content: message.content })
        .from(message)
        .where(eq(message.conversationId, convo!.id))
        .orderBy(desc(message.createdAt))
        .limit(HISTORY_MESSAGES),
      searchKnowledge(proj.id, body.message),
    ]);
    await db.insert(message).values({
      id: crypto.randomUUID(),
      conversationId: convo!.id,
      role: "user",
      content: body.message,
      inputMode: body.inputMode,
      pageUrl,
    });
    setup = { body, proj, convo: convo!, history: history.reverse(), knowledge, pageUrl };
  } catch (error) {
    return sdkErrorResponse(error, origin);
  }

  const { body, proj, convo, history, knowledge, pageUrl } = setup;
  const settings = parseProjectSettings(proj.settings);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      send({ type: "meta", conversationId: convo.id });
      let reply = "";
      try {
        const replyStream = streamReply({
          prompt: {
            assistantName: settings.appearance.assistantName,
            appName: proj.name,
            mode: settings.behavior.mode,
            customInstructions: settings.behavior.customInstructions,
          },
          turn: {
            question: body.message,
            inputMode: body.inputMode,
            pageUrl,
            pageTitle: body.page.title,
            snapshot: body.page.snapshot,
            knowledge,
          },
          history,
          signal: request.signal,
        });
        let next = await replyStream.next();
        while (!next.done) {
          reply += next.value;
          send({ type: "text", delta: next.value });
          next = await replyStream.next();
        }
        if (reply.trim()) {
          await db.insert(message).values({
            id: crypto.randomUUID(),
            conversationId: convo.id,
            role: "assistant",
            content: reply,
            pageUrl,
            inputTokens: next.value.inputTokens,
            outputTokens: next.value.outputTokens,
          });
        }
        send({ type: "done" });
      } catch (error) {
        console.error("[chat] reply failed", error);
        if (!request.signal.aborted) send({ type: "error", message: "Something went wrong. Please try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
