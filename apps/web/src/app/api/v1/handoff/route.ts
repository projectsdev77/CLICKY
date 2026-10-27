import { NextResponse } from "next/server";
import { and, asc, conversation, eq, message } from "@clicky/db";
import { handoffRequestSchema, stripMarkers, type HandoffResponse } from "@clicky/shared";
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

/** "Talk to a person": marks the conversation escalated and returns its transcript for the support channel. */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  try {
    const body = await parseBody(request, handoffRequestSchema);
    const proj = await authorizeProject(body.projectKey, origin);
    enforceRateLimit(`handoff:${proj.id}:${body.anonymousId}`, 10);
    const user = await findEndUser(proj.id, body.anonymousId);
    if (!user) throw new SdkError("unknown_conversation", 404);
    const [convo] = await db
      .update(conversation)
      .set({ outcome: "escalated" })
      .where(and(eq(conversation.id, body.conversationId), eq(conversation.projectId, proj.id), eq(conversation.endUserId, user.id)))
      .returning({ id: conversation.id });
    if (!convo) throw new SdkError("unknown_conversation", 404);
    const messages = await db
      .select({ role: message.role, content: message.content })
      .from(message)
      .where(eq(message.conversationId, convo.id))
      .orderBy(asc(message.createdAt));
    const transcript = messages
      .map((m) => `${m.role === "user" ? "User" : "Clicky"}: ${stripMarkers(m.content).trim()}`)
      .join("\n");
    const response: HandoffResponse = { transcript };
    return NextResponse.json(response, { headers: corsHeaders(origin) });
  } catch (error) {
    return sdkErrorResponse(error, origin);
  }
}
