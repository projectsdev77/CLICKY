import "server-only";
import type { ChatEvent } from "@clicky/shared";
import { corsHeaders } from "./sdk-request";

/** Streams ChatEvents to the widget as server-sent events. */
export function sseResponse(origin: string | null, run: (send: (event: ChatEvent) => void) => Promise<void>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        await run(send);
      } catch (error) {
        console.error("[chat] reply failed", error);
        send({ type: "error", message: "Something went wrong. Please try again." });
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
