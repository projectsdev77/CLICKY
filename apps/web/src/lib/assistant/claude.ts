import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import type { ReplyStream } from "./index";

let client: Anthropic | null = null;

function getClient() {
  client ??= new Anthropic();
  return client;
}

/** Streams a reply from Claude. Yields text deltas; returns token usage. */
export async function* streamClaude(
  system: string,
  messages: Anthropic.Beta.BetaMessageParam[],
  signal: AbortSignal,
): ReplyStream {
  try {
    const stream = getClient().beta.messages.stream(
      {
        model: env.ASSISTANT_MODEL,
        max_tokens: 2048,
        // Voice replies need to start fast; low effort keeps thinking short.
        output_config: { effort: "low" },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
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
    if (final.stop_reason === "refusal") {
      yield "Sorry, I can't help with that one.";
    }
    return { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens };
  } catch (error) {
    if (signal.aborted) return { inputTokens: 0, outputTokens: 0 };
    if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) {
      console.error("[assistant] Claude temporarily unavailable:", error.message);
      yield "I'm a bit overloaded right now. Try again in a moment.";
    } else if (error instanceof Anthropic.APIError) {
      console.error(`[assistant] Claude API error ${error.status}:`, error.message);
      yield "Something went wrong on my side. Try again in a moment.";
    } else {
      throw error;
    }
    return { inputTokens: 0, outputTokens: 0 };
  }
}
