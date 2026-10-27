import { NextResponse } from "next/server";
import { onboardingCompletion } from "@clicky/db";
import { onboardingCompleteRequestSchema, parseProjectSettings } from "@clicky/shared";
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

/** Records that the user finished an onboarding step. */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  try {
    const body = await parseBody(request, onboardingCompleteRequestSchema);
    const proj = await authorizeProject(body.projectKey, origin);
    enforceRateLimit(`onboarding-done:${proj.id}:${body.anonymousId}`, 60);
    const { onboarding } = parseProjectSettings(proj.settings);
    if (!onboarding.steps.some((s) => s.id === body.stepId)) throw new SdkError("unknown_step", 404);
    const user = await findEndUser(proj.id, body.anonymousId);
    if (!user) throw new SdkError("unknown_user", 404);
    await db
      .insert(onboardingCompletion)
      .values({ projectId: proj.id, endUserId: user.id, stepId: body.stepId })
      .onConflictDoNothing();
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  } catch (error) {
    return sdkErrorResponse(error, origin);
  }
}
