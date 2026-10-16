import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { project } from "@clicky/db";
import {
  isOriginAllowed,
  isPublicKey,
  parseProjectSettings,
  sdkInitRequestSchema,
  type SdkInitResponse,
} from "@clicky/shared";
import { db } from "@/lib/db";

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/**
 * CORS is open on this endpoint: the response holds nothing secret, and the real
 * check (origin vs. the project's allowed websites) happens on POST, where we know
 * the project key. Errors are readable too, so the SDK can tell developers why
 * Clicky didn't load.
 */
export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: origin ? corsHeaders(origin) : {} });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const headers = origin ? corsHeaders(origin) : undefined;
  const parsed = sdkInitRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isPublicKey(parsed.data.projectKey)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers });
  }

  const [row] = await db.select().from(project).where(eq(project.publicKey, parsed.data.projectKey)).limit(1);
  if (!row) return NextResponse.json({ error: "unknown_project" }, { status: 404, headers });
  if (!origin || !isOriginAllowed(origin, row.allowedOrigins)) {
    return NextResponse.json({ error: "origin_not_allowed" }, { status: 403, headers });
  }

  let pageUrl = parsed.data.url;
  try {
    const url = new URL(pageUrl);
    pageUrl = url.origin + url.pathname; // drop query/hash; they often carry tokens
  } catch {}

  await db.update(project).set({ lastSeenAt: new Date(), lastSeenUrl: pageUrl }).where(eq(project.id, row.id));

  const settings = parseProjectSettings(row.settings);
  const body: SdkInitResponse = {
    projectId: row.id,
    appearance: settings.appearance,
    behavior: { mode: settings.behavior.mode, voiceEnabled: settings.behavior.voiceEnabled },
    masking: settings.masking,
  };
  return NextResponse.json(body, { headers });
}
