import "server-only";

/**
 * Fixed-window, in-memory rate limiter. Good enough for a single instance;
 * swap for Redis/Upstash when we run more than one server.
 */
type Windows = Map<string, { count: number; resetAt: number }>;
// Shared across Next.js bundles in the same process (see billing.ts).
const globalWindows = globalThis as unknown as { clickyRateLimits?: Windows };
const windows = (globalWindows.clickyRateLimits ??= new Map());

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    if (windows.size > 50_000) {
      for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
    }
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}
