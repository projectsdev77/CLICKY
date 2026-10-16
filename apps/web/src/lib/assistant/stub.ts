import type { KnowledgeHit } from "../knowledge";
import type { ReplyStream } from "./index";

/**
 * A deterministic stand-in for Claude, used when no Anthropic credentials are
 * configured (local development, CI, demos). It finds the page element whose
 * label best matches the question and points at it, and quotes the best
 * help-center excerpt. It is not smart; it exists so the whole pipeline
 * (snapshot → server → markers → pointer → speech) can be exercised offline.
 */

const STOPWORDS = new Set(
  "a an the to of in on for and or how do i can you me my is it this that where what with please want change find get set update use go see make show".split(" "),
);

function words(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

function bestElement(question: string, snapshot: string) {
  const wanted = words(question);
  let best: { ref: string; label: string; score: number } | null = null;
  for (const line of snapshot.split("\n")) {
    const match = line.match(/^\[(e\d+)\] (\S+) "([^"]*)"/);
    if (!match) continue;
    const [, ref, role, label] = match;
    const labelWords = words(label!);
    const score = wanted.filter((w) => labelWords.some((l) => l.startsWith(w) || w.startsWith(l))).length;
    // Prefer buttons/links over form fields on ties.
    const adjusted = score + (role === "button" || role === "link" ? 0.1 : 0);
    if (score > 0 && (!best || adjusted > best.score)) best = { ref: ref!, label: label!, score: adjusted };
  }
  return best;
}

export async function* streamStub(question: string, snapshot: string, knowledge: KnowledgeHit[]): ReplyStream {
  const element = bestElement(question, snapshot);
  const parts: string[] = [];
  if (element) parts.push(`Sure. It's right here: {{point:${element.ref}}}${element.label}.`);
  if (knowledge[0]) {
    const excerpt = knowledge[0].content.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
    parts.push(`From the help center: ${excerpt}`);
  }
  if (parts.length === 0) {
    parts.push("I'm not sure about that one yet. Try asking about something you can see on this page.");
  }
  const reply = parts.join(" ");
  for (const token of reply.match(/\S+\s*/g) ?? []) {
    await new Promise((r) => setTimeout(r, 15));
    yield token;
  }
  return { inputTokens: 0, outputTokens: 0 };
}
