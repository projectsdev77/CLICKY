import { NextResponse } from "next/server";
import { event } from "@clicky/db";
import { eventsRequestSchema } from "@clicky/shared";
import { db } from "@/lib/db";
import {
  authorizeProject,
  corsHeaders,
  enforceRateLimit,
  parseBody,
  preflight,
  sdkErrorResponse,
  upsertEndUser,
} from "@/lib/sdk-request";

export const OPTIONS = preflight;

/** Batched page views and struggle signals from the SDK (also sent with navigator.sendBeacon as text/plain). */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  try {
    const body = await parseBody(request, eventsRequestSchema);
    const proj = await authorizeProject(body.projectKey, origin);
    enforceRateLimit(`events:${proj.id}:${body.anonymousId}`, 60);
    enforceRateLimit(`events:${proj.id}`, 6000);
    const user = await upsertEndUser(proj.id, body);
    const now = Date.now();
    await db.insert(event).values(
      body.events.map((e) => ({
        id: crypto.randomUUID(),
        projectId: proj.id,
        endUserId: user.id,
        sessionId: body.sessionId,
        type: e.type,
        path: e.path.split(/[?#]/)[0]!.slice(0, 300) || "/",
        element: e.element ?? null,
        props: e.props ?? {},
        // Trust the client's clock only within the last day.
        createdAt: new Date(Math.min(now, Math.max(now - 86_400_000, e.at))),
      })),
    );
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  } catch (error) {
    return sdkErrorResponse(error, origin);
  }
}
