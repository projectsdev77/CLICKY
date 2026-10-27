import { NextResponse } from "next/server";
import { and, eq, onboardingCompletion } from "@clicky/db";
import { onboardingStateRequestSchema, parseProjectSettings, type OnboardingState } from "@clicky/shared";
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

/** The onboarding checklist for this user (null if it's off or they're past the audience window). */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  try {
    const body = await parseBody(request, onboardingStateRequestSchema);
    const proj = await authorizeProject(body.projectKey, origin);
    enforceRateLimit(`onboarding:${proj.id}:${body.anonymousId}`, 30);
    const { onboarding } = parseProjectSettings(proj.settings);
    if (!onboarding.enabled || onboarding.steps.length === 0) {
      return NextResponse.json(null, { headers: corsHeaders(origin) });
    }
    const user = await upsertEndUser(proj.id, body);
    if (Date.now() - user.firstSeenAt.getTime() > onboarding.audienceDays * 86_400_000) {
      return NextResponse.json(null, { headers: corsHeaders(origin) });
    }
    const done = await db
      .select({ stepId: onboardingCompletion.stepId })
      .from(onboardingCompletion)
      .where(and(eq(onboardingCompletion.projectId, proj.id), eq(onboardingCompletion.endUserId, user.id)));
    const state: OnboardingState = {
      title: onboarding.title,
      steps: onboarding.steps.map(({ id, title, doneWhen }) => ({ id, title, doneWhen })),
      completed: done.map((d) => d.stepId),
    };
    return NextResponse.json(state, { headers: corsHeaders(origin) });
  } catch (error) {
    return sdkErrorResponse(error, origin);
  }
}
