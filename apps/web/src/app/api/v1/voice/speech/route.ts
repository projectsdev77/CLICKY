import { ttsRequestSchema } from "@clicky/shared";
import { synthesizeSpeech } from "@/lib/voice";
import {
  SdkError,
  authorizeProject,
  corsHeaders,
  enforceRateLimit,
  parseBody,
  preflight,
  sdkErrorResponse,
} from "@/lib/sdk-request";

export const OPTIONS = preflight;

/** Streams spoken audio for one sentence of an assistant reply. */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  try {
    const body = await parseBody(request, ttsRequestSchema);
    const row = await authorizeProject(body.projectKey, origin);
    enforceRateLimit(`tts:${row.id}:${body.anonymousId}`, 120);
    const audio = await synthesizeSpeech(body.text, request.signal);
    if (!audio) throw new SdkError("voice_unavailable", 404);
    return new Response(audio.body, {
      headers: { ...corsHeaders(origin), "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return sdkErrorResponse(error, origin);
  }
}
