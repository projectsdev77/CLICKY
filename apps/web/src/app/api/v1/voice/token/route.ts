import { NextResponse } from "next/server";
import { voiceTokenRequestSchema } from "@clicky/shared";
import { createDeepgramToken } from "@/lib/voice";
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

/** Short-lived token for streaming speech-to-text from the browser. */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  try {
    const body = await parseBody(request, voiceTokenRequestSchema);
    const row = await authorizeProject(body.projectKey, origin);
    enforceRateLimit(`stt:${row.id}:${body.anonymousId}`, 30);
    const token = await createDeepgramToken();
    if (!token) throw new SdkError("voice_unavailable", 404);
    return NextResponse.json(token, { headers: { ...corsHeaders(origin), "Cache-Control": "no-store" } });
  } catch (error) {
    return sdkErrorResponse(error, origin);
  }
}
