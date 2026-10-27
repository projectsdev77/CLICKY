import "server-only";
import { lookup as dnsLookup } from "node:dns";
import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

/**
 * Fetches a customer-supplied URL without letting it reach our own network
 * (SSRF): only http(s), no private/loopback/link-local addresses, redirects
 * re-checked, size and time capped.
 */

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

const allowPrivate = () => process.env.CLICKY_ALLOW_PRIVATE_FETCH === "1";

/**
 * DNS lookup used for the actual connection. Checking the address once up front
 * isn't enough (DNS rebinding: a hostname can resolve to a public address for the
 * check and a private one for the request), so every connection is checked here.
 */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 4);
    const list = addresses as unknown as { address: string; family: number }[];
    if (!allowPrivate() && list.some((a) => isPrivateAddress(a.address))) {
      return callback(new Error("That address isn't publicly reachable"), "", 4);
    }
    if (options.all) return (callback as unknown as (e: null, a: typeof list) => void)(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
};

const dispatcher = new Agent({ connect: { lookup: guardedLookup } });

async function assertPublicUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http and https links are supported");
  if (allowPrivate()) return; // local development against localhost sites
  if (isIP(url.hostname) && isPrivateAddress(url.hostname)) throw new Error("That address isn't publicly reachable");
  const addresses = await lookup(url.hostname, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error("That address isn't publicly reachable");
  }
}

const MAX_BYTES = 2 * 1024 * 1024;

export async function safeFetchHtml(input: string): Promise<{ url: string; html: string } | null> {
  let url = new URL(input);
  for (let redirects = 0; redirects <= 3; redirects++) {
    await assertPublicUrl(url);
    const res = await undiciFetch(url, {
      dispatcher,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "ClickyBot/0.1 (+knowledge sync)", Accept: "text/html" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url.host}`);
    if (!(res.headers.get("content-type") ?? "").includes("text/html")) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    return { url: url.toString(), html: new TextDecoder().decode(Buffer.concat(chunks)) };
  }
  throw new Error("Too many redirects");
}
