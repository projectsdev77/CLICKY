import type Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import { agentAction, agentRun, and, eq } from "@clicky/db";
import { chatContinueRequestSchema, isPathBlocked, parseProjectSettings, type ActionResult } from "@clicky/shared";
import { db } from "@/lib/db";
import { buildSystemPrompt, describePage } from "@/lib/assistant/prompt";
import { classifyConversation } from "@/lib/assistant/classify";
import { runStep, toolResultBlocks } from "@/lib/assistant/run";
import { sseResponse } from "@/lib/sse";
import {
  SdkError,
  authorizeProject,
  cleanUrl,
  enforceRateLimit,
  findEndUser,
  parseBody,
  preflight,
  sdkErrorResponse,
} from "@/lib/sdk-request";

export const OPTIONS = preflight;

/** The widget reports what happened to the actions it was given; the assistant takes the next step. */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  let setup;
  try {
    const body = await parseBody(request, chatContinueRequestSchema);
    const proj = await authorizeProject(body.projectKey, origin);
    enforceRateLimit(`continue:${proj.id}:${body.anonymousId}`, 60);
    const user = await findEndUser(proj.id, body.anonymousId);
    if (!user) throw new SdkError("unknown_run", 404);
    // Claim the run atomically so a double submit can't run the same step twice.
    const [run] = await db
      .update(agentRun)
      .set({ status: body.cancel ? "cancelled" : "running" })
      .where(
        and(
          eq(agentRun.id, body.runId),
          eq(agentRun.projectId, proj.id),
          eq(agentRun.endUserId, user.id),
          eq(agentRun.status, "waiting"),
        ),
      )
      .returning();
    if (!run) throw new SdkError("unknown_run", 404);
    setup = { body, proj, run };
  } catch (error) {
    return sdkErrorResponse(error, origin);
  }

  const { body, proj, run } = setup;
  const pageUrl = cleanUrl(body.page.url);
  const results: ActionResult[] = [...JSON.parse(run.pendingResults), ...body.results];
  await Promise.all(
    body.results.map((r) =>
      db
        .update(agentAction)
        .set({ status: r.status, output: r.output.slice(0, 1000), completedAt: new Date() })
        .where(and(eq(agentAction.id, r.id), eq(agentAction.runId, run.id))),
    ),
  );

  // Once the reply has streamed, group the question into a topic (background).
  after(() => classifyConversation(proj.id, run.conversationId));

  return sseResponse(origin, async (send) => {
    if (body.cancel) {
      send({ type: "done" });
      return;
    }
    const settings = parseProjectSettings(proj.settings);
    const messages = JSON.parse(run.messages) as Anthropic.Beta.BetaMessageParam[];
    const page = {
      url: pageUrl,
      title: body.page.title,
      snapshot: body.page.snapshot,
      actionsBlocked: isPathBlocked(settings.behavior.blockedPaths, new URL(pageUrl, "http://x").pathname),
    };
    messages.push({
      role: "user",
      content: [...toolResultBlocks(messages, results), { type: "text", text: `The page now:\n${describePage(page)}` }],
    });
    await db.update(agentRun).set({ messages: JSON.stringify(messages), pendingResults: "[]" }).where(eq(agentRun.id, run.id));
    await runStep({
      run,
      messages,
      system: buildSystemPrompt({
        assistantName: settings.appearance.assistantName,
        appName: proj.name,
        mode: run.mode,
        customInstructions: settings.behavior.customInstructions,
      }),
      mode: run.mode,
      pageUrl,
      send,
      signal: request.signal,
      stub: { question: "", snapshot: body.page.snapshot, knowledge: [], lastResults: results },
    });
  });
}
