import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import type { ModelCall, ModelStream } from "./index";

let client: Anthropic | null = null;

function getClient() {
  client ??= new Anthropic();
  return client;
}

/** One Claude call. Yields text deltas as they stream; returns the full assistant turn. */
export async function* callClaude({ system, messages, tools, signal }: ModelCall): ModelStream {
  const stream = getClient().beta.messages.stream(
    {
      model: env.ASSISTANT_MODEL,
      max_tokens: 4096,
      // Voice replies need to start fast; low effort keeps thinking short.
      output_config: { effort: "low" },
      system: [{ type: "text", text: system }],
      tools,
      // Cache the stable prefix (tools, system, earlier steps of this run).
      cache_control: { type: "ephemeral" },
      messages,
      // If the model declines for policy reasons, retry server-side on the recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    },
    { signal },
  );
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
  }
  const final = await stream.finalMessage();
  return {
    content: final.content,
    stopReason: final.stop_reason,
    usage: { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens },
  };
}

/** Maps API failures to something we can say to the user; rethrows anything unexpected. */
export function describeClaudeError(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) {
    console.error("[assistant] Claude temporarily unavailable:", error.message);
    return "I'm a bit overloaded right now. Try again in a moment.";
  }
  if (error instanceof Anthropic.APIError) {
    console.error(`[assistant] Claude API error ${error.status}:`, error.message);
    return "Something went wrong on my side. Try again in a moment.";
  }
  throw error;
}
