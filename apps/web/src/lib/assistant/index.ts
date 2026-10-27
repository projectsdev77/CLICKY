import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";

export type Usage = { inputTokens: number; outputTokens: number };

/** One completed model call: the exact assistant content to append to the run's history. */
export interface ModelTurn {
  content: Anthropic.Beta.BetaContentBlock[];
  stopReason: Anthropic.Beta.BetaStopReason | null;
  usage: Usage;
}

/** Yields text deltas while the model writes; returns the finished turn. */
export type ModelStream = AsyncGenerator<string, ModelTurn, void>;

export interface ModelCall {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  tools: Anthropic.Beta.BetaTool[];
  signal: AbortSignal;
}

export function assistantProvider(): "claude" | "stub" {
  if (env.ASSISTANT_PROVIDER === "stub") return "stub";
  if (env.ASSISTANT_PROVIDER === "claude") return "claude";
  // The SDK also reads ANTHROPIC_AUTH_TOKEN / `ant auth login` profiles, but a key is the explicit signal.
  return env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? "claude" : "stub";
}
