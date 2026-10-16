import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { and, endUser, eq, project } from "@clicky/db";
import { isOriginAllowed, isPublicKey, type sdkCallerSchema } from "@clicky/shared";
import { db } from "./db";
import { rateLimit } from "./rate-limit";

/**
 * Helpers for the public endpoints the SDK calls from customers' websites.
 * CORS is open (responses hold nothing secret); every call is checked against
 * the project's allowed websites using the browser-supplied Origin header.
 */

export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function preflight(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export class SdkError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}

export function sdkErrorResponse(error: unknown, origin: string | null) {
  if (error instanceof SdkError) {
    return NextResponse.json({ error: error.code }, { status: error.status, headers: corsHeaders(origin) });
  }
  console.error("[sdk] unexpected error", error);
  return NextResponse.json({ error: "internal_error" }, { status: 500, headers: corsHeaders(origin) });
}

/** Parses the JSON body against `schema` or throws a 400. */
export async function parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new SdkError("invalid_request", 400);
  return parsed.data;
}

/** Loads the project for a public key and checks the request comes from one of its websites. */
export async function authorizeProject(projectKey: string, origin: string | null) {
  if (!isPublicKey(projectKey)) throw new SdkError("invalid_request", 400);
  const [row] = await db.select().from(project).where(eq(project.publicKey, projectKey)).limit(1);
  if (!row) throw new SdkError("unknown_project", 404);
  if (!origin || !isOriginAllowed(origin, row.allowedOrigins)) throw new SdkError("origin_not_allowed", 403);
  return row;
}

export function enforceRateLimit(key: string, limit: number, windowMs = 60_000) {
  if (!rateLimit(key, limit, windowMs)) throw new SdkError("rate_limited", 429);
}

/** Finds or creates the end user for this browser, refreshing identity and traits. */
export async function upsertEndUser(projectId: string, caller: z.infer<typeof sdkCallerSchema>) {
  const now = new Date();
  const externalId = caller.user?.userId ?? null;
  const traits = caller.user?.traits ?? {};
  const [row] = await db
    .insert(endUser)
    .values({ id: crypto.randomUUID(), projectId, anonymousId: caller.anonymousId, externalId, traits })
    .onConflictDoUpdate({
      target: [endUser.projectId, endUser.anonymousId],
      set: externalId ? { externalId, traits, lastSeenAt: now } : { lastSeenAt: now },
    })
    .returning();
  return row!;
}

export async function findEndUser(projectId: string, anonymousId: string) {
  const [row] = await db
    .select()
    .from(endUser)
    .where(and(eq(endUser.projectId, projectId), eq(endUser.anonymousId, anonymousId)))
    .limit(1);
  return row;
}

/** Keeps only scheme, host and path: query strings and fragments often carry tokens. */
export function cleanUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return url.origin + url.pathname;
  } catch {
    return raw.slice(0, 300);
  }
}
