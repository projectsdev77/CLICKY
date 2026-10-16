/** Masks common personal data in text before it leaves the browser. */
const PATTERNS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[email]"],
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[id number]"],
  // 13–19 digits, optionally grouped by spaces or dashes (card numbers)
  [/\b(?:\d[ -]?){12,18}\d\b/g, "[card number]"],
  // phone numbers: optional country code, then 10 digits in common groupings
  [/(?:\+\d{1,3}[ .-]?)?(?:\(\d{3}\)|\b\d{3})[ .-]?\d{3}[ .-]?\d{4}\b/g, "[phone]"],
];

export function maskPII(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}
