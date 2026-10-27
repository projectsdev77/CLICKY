import { NextResponse } from "next/server";
import { and, conversation, eq } from "@clicky/db";
import { feedbackRequestSchema } from "@clicky/shared";
import { db } from "@/lib/db";
import {
  SdkError,
  authorizeProject,
  corsHeaders,
  enforceRateLimit,
  findEndUser,
  parseBody,
  preflight,
  sdkErrorResponse,
} from "@/lib/sdk-request";

export const OPTIONS = preflight;

/** 👍 / 👎 on a conversation. */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  try {
    const body = await parseBody(request, feedbackRequestSchema);
    const proj = await authorizeProject(body.projectKey, origin);
    enforceRateLimit(`feedback:${proj.id}:${body.anonymousId}`, 30);
    const user = await findEndUser(proj.id, body.anonymousId);
    if (!user) throw new SdkError("unknown_conversation", 404);
    const updated = await db
      .update(conversation)
      .set({ feedback: body.rating, feedbackAt: new Date(), outcome: body.rating === 1 ? "resolved" : "unresolved" })
      .where(
        and(
          eq(conversation.id, body.conversationId),
          eq(conversation.projectId, proj.id),
          eq(conversation.endUserId, user.id),
        ),
      )
      .returning({ id: conversation.id });
    if (updated.length === 0) throw new SdkError("unknown_conversation", 404);
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  } catch (error) {
    return sdkErrorResponse(error, origin);
  }
}
