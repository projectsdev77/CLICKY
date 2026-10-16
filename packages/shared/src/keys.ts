const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** Public, origin-bound key embedded in the host app's script tag. */
export function generatePublicKey(): string {
  return `pk_${randomString(24)}`;
}

export function isPublicKey(value: unknown): value is string {
  return typeof value === "string" && /^pk_[A-Za-z0-9]{24}$/.test(value);
}
