import { NextResponse } from "next/server";
import { eq, project } from "@clicky/db";
import { parseProjectSettings, sdkInitRequestSchema, type SdkInitResponse } from "@clicky/shared";
import { db } from "@/lib/db";
import { voiceProviders } from "@/lib/voice";
import { authorizeProject, cleanUrl, corsHeaders, parseBody, preflight, sdkErrorResponse } from "@/lib/sdk-request";

export const OPTIONS = preflight;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  try {
    const body = await parseBody(request, sdkInitRequestSchema);
    const row = await authorizeProject(body.projectKey, origin);
    await db
      .update(project)
      .set({ lastSeenAt: new Date(), lastSeenUrl: cleanUrl(body.url) })
      .where(eq(project.id, row.id));

    const settings = parseProjectSettings(row.settings);
    const response: SdkInitResponse = {
      projectId: row.id,
      appearance: settings.appearance,
      behavior: {
        mode: settings.behavior.mode,
        voiceEnabled: settings.behavior.voiceEnabled,
        blockedPaths: settings.behavior.blockedPaths,
        confirmKeywords: settings.behavior.confirmKeywords,
        trackSignals: settings.behavior.trackSignals,
      },
      masking: settings.masking,
      voice: voiceProviders(),
    };
    return NextResponse.json(response, { headers: corsHeaders(origin) });
  } catch (error) {
    return sdkErrorResponse(error, origin);
  }
}
