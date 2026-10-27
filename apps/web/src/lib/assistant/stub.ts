import type Anthropic from "@anthropic-ai/sdk";
import type { KnowledgeHit } from "../knowledge";
import type { ModelStream } from "./index";

/**
 * A deterministic stand-in for Claude, used when no Anthropic credentials are
 * configured (local development, CI, demos). It is not smart; it exists so the
 * whole pipeline (snapshot → server → markers → pointer → speech → actions)
 * can be exercised offline:
 *  - "how/where …" questions: points at the best-matching element and quotes the help center
 *  - "please …/can you …/… for me" requests (agent mode): picks a dropdown option and/or
 *    clicks the best-matching button, then reports what happened
 *  - "show me how/teach me …": a one-step walkthrough with wait_for_user
 */

const STOPWORDS = new Set(
  "a an the to of in on for and or how do i can you me my is it this that where what with please want change find get set update use go see make show teach walk through as".split(
    " ",
  ),
);

function words(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

type Element = { ref: string; role: string; label: string; options: string[] };

function parseSnapshot(snapshot: string): Element[] {
  const out: Element[] = [];
  for (const line of snapshot.split("\n")) {
    const m = line.match(/^\[(e\d+)\] (\S+) "([^"]*)"(.*)$/);
    if (!m) continue;
    const options = m[4]!.match(/options: (.*)$/)?.[1]?.split(" | ") ?? [];
    out.push({ ref: m[1]!, role: m[2]!, label: m[3]!, options });
  }
  return out;
}

function score(wanted: string[], text: string) {
  const have = words(text);
  return wanted.filter((w) => have.some((h) => h.startsWith(w) || w.startsWith(h))).length;
}

function best(elements: Element[], wanted: string[], filter: (e: Element) => boolean = () => true) {
  let top: { el: Element; s: number } | null = null;
  for (const el of elements.filter(filter)) {
    const s = score(wanted, el.label) + (el.role === "button" || el.role === "link" ? 0.1 : 0);
    if (s >= 1 && (!top || s > top.s)) top = { el, s };
  }
  return top?.el ?? null;
}

let counter = 0;
const toolId = () => `toolu_stub_${Date.now().toString(36)}_${counter++}`;

export interface StubInput {
  question: string;
  appActions?: { name: string; description: string; parameters?: { properties?: Record<string, { enum?: unknown[] }> } }[];
  snapshot: string;
  knowledge: KnowledgeHit[];
  mode: "agent" | "guide";
  /** Results of the previous step in this run, if this is a continuation. */
  lastResults: { status: string; output: string }[] | null;
}

async function* say(text: string): AsyncGenerator<string, void, void> {
  for (const token of text.match(/\S+\s*/g) ?? []) {
    await new Promise((r) => setTimeout(r, 10));
    yield token;
  }
}

export async function* callStub(input: StubInput): ModelStream {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const content: Anthropic.Beta.BetaContentBlock[] = [];
  const finish = async function* (text: string): ModelStream {
    yield* say(text);
    content.push({ type: "text", text, citations: null } as Anthropic.Beta.BetaTextBlock);
    return { content, stopReason: "end_turn", usage };
  };

  // Continuation: report on what happened.
  if (input.lastResults) {
    const failed = input.lastResults.find((r) => r.status !== "done");
    if (!failed) return yield* finish("Done.");
    if (failed.status === "declined") return yield* finish("Okay, I won't do that. What would you like instead?");
    return yield* finish(`That didn't work: ${failed.output}`);
  }

  const q = input.question.toLowerCase();
  const elements = parseSnapshot(input.snapshot);
  const wanted = words(input.question);
  const toolUse = (name: string, toolInput: Record<string, unknown>) =>
    content.push({ type: "tool_use", id: toolId(), name, input: toolInput } as Anthropic.Beta.BetaToolUseBlock);

  if (/\b(show me how|teach me|walk me through)\b/.test(q)) {
    const target = best(elements, wanted);
    if (target) {
      yield* say("Let's do it together.");
      content.push({ type: "text", text: "Let's do it together.", citations: null } as Anthropic.Beta.BetaTextBlock);
      toolUse("wait_for_user", {
        ref: target.ref,
        instruction: `Use ${target.label} here`,
        description: `Your turn: ${target.label}`,
      });
      return { content, stopReason: "tool_use", usage };
    }
  }

  const isRequest = /^(please|can you|could you)\b|\bfor me\b|^(export|delete|turn|set|switch|save|open|go)\b/.test(q);
  if (input.mode === "agent" && isRequest) {
    // A registered app action whose name/description matches the request.
    const appAction = (input.appActions ?? []).find((a) => score(wanted, `${a.name.replace(/([a-z])([A-Z])/g, "$1 $2")} ${a.description}`) >= 2);
    if (appAction) {
      const args: Record<string, unknown> = {};
      for (const [key, p] of Object.entries(appAction.parameters?.properties ?? {})) {
        const choice = p.enum?.find((v) => q.includes(String(v).toLowerCase()));
        if (choice !== undefined) args[key] = choice;
      }
      toolUse("app_action", {
        action: appAction.name,
        arguments_json: JSON.stringify(args),
        description: appAction.description.split(/[.!]/)[0]!.slice(0, 80),
        needs_confirmation: false,
      });
      yield* say("On it.");
      content.unshift({ type: "text", text: "On it.", citations: null } as Anthropic.Beta.BetaTextBlock);
      return { content, stopReason: "tool_use", usage };
    }
    // A dropdown whose option is mentioned, then the best button.
    for (const el of elements.filter((e) => e.role === "select")) {
      const option = el.options.find((o) => q.includes(o.toLowerCase()));
      if (option) {
        toolUse("select", { ref: el.ref, option, description: `Choose ${option}`, needs_confirmation: false });
        break;
      }
    }
    const button = best(elements, wanted, (e) => e.role === "button" || e.role === "link");
    if (button) {
      toolUse("click", {
        ref: button.ref,
        description: `Click ${button.label}`,
        needs_confirmation: /delete|remove|pay|switch/i.test(button.label),
      });
    }
    if (content.length) {
      yield* say("On it.");
      content.unshift({ type: "text", text: "On it.", citations: null } as Anthropic.Beta.BetaTextBlock);
      return { content, stopReason: "tool_use", usage };
    }
  }

  const target = best(elements, wanted);
  const parts: string[] = [];
  if (target) parts.push(`Sure. It's right here: {{point:${target.ref}}}${target.label}.`);
  if (input.knowledge[0]) {
    const excerpt = input.knowledge[0].content.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
    parts.push(`From the help center: ${excerpt}`);
  }
  if (parts.length === 0) parts.push("I'm not sure about that one yet. Try asking about something you can see on this page.");
  return yield* finish(parts.join(" "));
}
