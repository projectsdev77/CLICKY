/**
 * Normalizes a user-entered origin ("https://app.acme.com/", "app.acme.com")
 * to "scheme://host[:port]". Wildcard hosts ("*.acme.com") are kept as-is.
 * Returns null for input that can't be an origin.
 */
export function normalizeOrigin(input: string): string | null {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const wildcard = withScheme.match(/^(https?):\/\/\*\.([a-z0-9.-]+)(:\d+)?$/i);
  if (wildcard) return `${wildcard[1]!.toLowerCase()}://*.${wildcard[2]!.toLowerCase()}${wildcard[3] ?? ""}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** True if `origin` (from a request's Origin header) matches one of the allowed origins. */
export function isOriginAllowed(origin: string | null | undefined, allowed: readonly string[]): boolean {
  if (!origin) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  for (const entry of allowed) {
    const wildcard = entry.match(/^(https?):\/\/\*\.([^:]+)(:\d+)?$/);
    if (wildcard) {
      const [, scheme, base, port] = wildcard;
      if (
        url.protocol === `${scheme}:` &&
        url.hostname.endsWith(`.${base}`) &&
        (port ? url.port === port.slice(1) : url.port === "")
      ) {
        return true;
      }
    } else if (entry === url.origin) {
      return true;
    }
  }
  return false;
}
