import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import type { KnowledgeHit } from "../knowledge";
import { streamClaude } from "./claude";
import { buildSystemPrompt, buildUserTurn, type PromptContext, type TurnContext } from "./prompt";
import { streamStub } from "./stub";

export type Usage = { inputTokens: number; outputTokens: number };
export type ReplyStream = AsyncGenerator<string, Usage, void>;

export function assistantProvider(): "claude" | "stub" {
  if (env.ASSISTANT_PROVIDER === "stub") return "stub";
  if (env.ASSISTANT_PROVIDER === "claude") return "claude";
  // The SDK also reads ANTHROPIC_AUTH_TOKEN / `ant auth login` profiles, but a key is the explicit signal.
  return env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? "claude" : "stub";
}

export interface ReplyInput {
  prompt: PromptContext;
  turn: TurnContext & { knowledge: KnowledgeHit[] };
  /** Earlier turns in this conversation, oldest first (plain text, no old page snapshots). */
  history: { role: "user" | "assistant"; content: string }[];
  signal: AbortSignal;
}

export function streamReply({ prompt, turn, history, signal }: ReplyInput): ReplyStream {
  if (assistantProvider() === "stub") return streamStub(turn.question, turn.snapshot, turn.knowledge);
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: buildUserTurn(turn) },
  ];
  return streamClaude(buildSystemPrompt(prompt), messages, signal);
}
