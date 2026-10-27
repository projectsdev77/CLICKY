import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { agentAction, agentRun, conversation, eq, message, sql } from "@clicky/db";
import { stripMarkers, type ActionResult, type AgentAction, type ChatEvent } from "@clicky/shared";
import { db } from "../db";
import { assistantProvider, type ModelTurn } from "./index";
import { callClaude, describeClaudeError } from "./claude";
import { callStub, type StubInput } from "./stub";
import { parseToolUse, toolsFor } from "./tools";

/** Hard cap on model calls per run, so a confused agent can't loop forever. */
export const MAX_STEPS = 20;

type Run = typeof agentRun.$inferSelect;
type Send = (event: ChatEvent) => void;

export interface StepContext {
  run: Run;
  messages: Anthropic.Beta.BetaMessageParam[];
  system: string;
  mode: "agent" | "guide";
  pageUrl: string;
  send: Send;
  signal: AbortSignal;
  /** What the offline stand-in needs (it can't read the conversation like Claude can). */
  stub: Omit<StubInput, "mode">;
}

async function callModel(ctx: StepContext, onText: (delta: string) => void): Promise<ModelTurn> {
  const stream =
    assistantProvider() === "stub"
      ? callStub({ ...ctx.stub, mode: ctx.mode })
      : callClaude({ system: ctx.system, messages: ctx.messages, tools: toolsFor(ctx.mode), signal: ctx.signal });
  let next = await stream.next();
  while (!next.done) {
    onText(next.value);
    next = await stream.next();
  }
  return next.value;
}

async function finish(ctx: StepContext, status: "completed" | "failed", text: string, usage = { inputTokens: 0, outputTokens: 0 }) {
  await db
    .update(agentRun)
    .set({
      status,
      messages: JSON.stringify(ctx.messages),
      inputTokens: sql`${agentRun.inputTokens} + ${usage.inputTokens}`,
      outputTokens: sql`${agentRun.outputTokens} + ${usage.outputTokens}`,
    })
    .where(eq(agentRun.id, ctx.run.id));
  if (text.trim()) await saveAssistantText(ctx, text, usage);
}

async function saveAssistantText(ctx: StepContext, text: string, usage: { inputTokens: number; outputTokens: number }) {
  await db.insert(message).values({
    id: crypto.randomUUID(),
    conversationId: ctx.run.conversationId,
    role: "assistant",
    content: text,
    pageUrl: ctx.pageUrl,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  });
}

/**
 * Runs one model call for the run, streaming text to the widget. If the model
 * asks for actions, they're logged and sent to the widget, and the run waits for
 * /chat/continue. Otherwise the run is complete.
 */
export async function runStep(ctx: StepContext): Promise<void> {
  if (ctx.run.steps >= MAX_STEPS) {
    const text = "I've taken quite a few steps on this, so I'll stop here. Tell me if you'd like me to keep going.";
    ctx.send({ type: "text", delta: text });
    await finish(ctx, "completed", text);
    ctx.send({ type: "done" });
    return;
  }

  let text = "";
  let turn: ModelTurn;
  try {
    turn = await callModel(ctx, (delta) => {
      text += delta;
      ctx.send({ type: "text", delta });
    });
  } catch (error) {
    if (ctx.signal.aborted) return;
    const apology = describeClaudeError(error);
    ctx.send({ type: "text", delta: (text ? " " : "") + apology });
    await finish(ctx, "failed", text);
    ctx.send({ type: "done" });
    return;
  }

  const toolUses = turn.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");

  if (turn.stopReason === "refusal") {
    // Don't keep a refused turn in history; it may hold a partial tool call.
    const apology = "Sorry, I can't help with that one.";
    ctx.send({ type: "text", delta: (text ? " " : "") + apology });
    await finish(ctx, "completed", `${text} ${apology}`.trim(), turn.usage);
    ctx.send({ type: "done" });
    return;
  }
  if (turn.stopReason === "max_tokens" && toolUses.length) {
    // A tool call cut off mid-input can't be trusted; drop the turn instead of running it.
    const apology = "Sorry, I lost my train of thought. Could you ask that again?";
    ctx.send({ type: "text", delta: (text ? " " : "") + apology });
    await finish(ctx, "failed", `${text} ${apology}`.trim(), turn.usage);
    ctx.send({ type: "done" });
    return;
  }

  // Append the assistant turn exactly as returned; history is append-only within a run.
  ctx.messages.push({ role: "assistant", content: turn.content as Anthropic.Beta.BetaContentBlockParam[] });

  if (turn.stopReason !== "tool_use" || toolUses.length === 0) {
    await finish(ctx, "completed", text, turn.usage);
    ctx.send({ type: "done" });
    return;
  }

  const actions: AgentAction[] = [];
  const serverResults: ActionResult[] = [];
  for (const block of toolUses) {
    const parsed = parseToolUse(block, ctx.mode);
    if (parsed.ok) actions.push(parsed.action);
    else serverResults.push({ id: parsed.id, status: "failed", output: parsed.error });
  }

  if (text.trim()) await saveAssistantText(ctx, text, turn.usage);
  await db
    .update(agentRun)
    .set({
      status: "waiting",
      messages: JSON.stringify(ctx.messages),
      pendingResults: JSON.stringify(serverResults),
      steps: sql`${agentRun.steps} + 1`,
      inputTokens: sql`${agentRun.inputTokens} + ${turn.usage.inputTokens}`,
      outputTokens: sql`${agentRun.outputTokens} + ${turn.usage.outputTokens}`,
    })
    .where(eq(agentRun.id, ctx.run.id));
  if (actions.length) {
    await db.insert(agentAction).values(
      actions.map((a) => ({
        id: a.id,
        runId: ctx.run.id,
        projectId: ctx.run.projectId,
        name: a.name,
        description: a.input.description,
        input: a.input,
        needsConfirmation: a.needsConfirmation,
        pageUrl: ctx.pageUrl,
      })),
    );
    if (actions.some((a) => a.name !== "wait_for_user")) {
      await db.update(conversation).set({ mode: "agent" }).where(eq(conversation.id, ctx.run.conversationId));
    }
  }
  // Even if every call was invalid, the widget answers with an empty result list and we continue.
  ctx.send({ type: "actions", runId: ctx.run.id, actions });
}

/** Tool results for the previous assistant turn, in the order the model asked for them. */
export function toolResultBlocks(
  messages: Anthropic.Beta.BetaMessageParam[],
  results: ActionResult[],
): Anthropic.Beta.BetaToolResultBlockParam[] {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant" || typeof last.content === "string") return [];
  const byId = new Map(results.map((r) => [r.id, r]));
  return last.content
    .filter((b): b is Anthropic.Beta.BetaToolUseBlockParam => b.type === "tool_use")
    .map((b) => {
      const r = byId.get(b.id) ?? { status: "skipped", output: "Not run." };
      return {
        type: "tool_result",
        tool_use_id: b.id,
        content: `${r.status}: ${r.output}`,
        is_error: r.status === "failed" || r.status === "blocked",
      };
    });
}

export { stripMarkers };
