import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { APP_ACTION_NAME_RE, RISKY_ACTION_RE, type AgentAction, type AgentActionName } from "@clicky/shared";

/**
 * Tools the assistant can call. They all run in the user's browser (the widget
 * executes them and reports back), so they are plain client tools. The set is
 * fixed per project mode so it never changes within a conversation.
 */

const description = z.string().min(1).max(120);
const ref = z.string().regex(/^e\d{1,4}$/);

const inputSchemas = {
  click: z.object({ ref, description, needs_confirmation: z.boolean() }),
  type: z.object({ ref, text: z.string().max(2000), submit: z.boolean(), description, needs_confirmation: z.boolean() }),
  select: z.object({ ref, option: z.string().min(1).max(200), description, needs_confirmation: z.boolean() }),
  navigate: z.object({ path: z.string().regex(/^\/(?!\/)/).max(500), description, needs_confirmation: z.boolean() }),
  scroll: z.object({ direction: z.enum(["up", "down"]), ref: ref.nullable(), description }),
  wait_for_user: z.object({ ref, instruction: z.string().min(1).max(200), description }),
  app_action: z.object({
    action: z.string().regex(APP_ACTION_NAME_RE),
    arguments_json: z.string().max(4000),
    description,
    needs_confirmation: z.boolean(),
  }),
} satisfies Record<AgentActionName, z.ZodType>;

const DESCRIPTION_PROP = {
  type: "string",
  description: "What this step does, in a few words the user will see, e.g. \"Click Export\" or \"Choose Excel\".",
};
const CONFIRM_PROP = {
  type: "boolean",
  description:
    "true if this step deletes something, spends money, sends or publishes something, changes a plan or permissions, or can't easily be undone. The user is asked to approve it first.",
};
const REF_PROP = { type: "string", description: "Element ref from the latest page snapshot, e.g. \"e12\"." };

function tool(name: AgentActionName, toolDescription: string, properties: Record<string, unknown>): Anthropic.Beta.BetaTool {
  return {
    name,
    description: toolDescription,
    input_schema: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
    strict: true,
    eager_input_streaming: true,
  };
}

const ACTION_TOOLS: Anthropic.Beta.BetaTool[] = [
  tool("click", "Click an element on the page (button, link, checkbox, tab, menu item).", {
    ref: REF_PROP,
    description: DESCRIPTION_PROP,
    needs_confirmation: CONFIRM_PROP,
  }),
  tool("type", "Replace the text in a text field. Never use for passwords or payment details.", {
    ref: REF_PROP,
    text: { type: "string", description: "The full text the field should contain." },
    submit: { type: "boolean", description: "Press Enter afterwards (e.g. to run a search)." },
    description: DESCRIPTION_PROP,
    needs_confirmation: CONFIRM_PROP,
  }),
  tool("select", "Choose an option in a dropdown (<select>).", {
    ref: REF_PROP,
    option: { type: "string", description: "The option's visible text, as listed in the snapshot." },
    description: DESCRIPTION_PROP,
    needs_confirmation: CONFIRM_PROP,
  }),
  tool("navigate", "Go to another page of this app by path. Prefer clicking a visible link when there is one.", {
    path: { type: "string", description: "Path on the same site, starting with /, e.g. /settings." },
    description: DESCRIPTION_PROP,
    needs_confirmation: CONFIRM_PROP,
  }),
  tool("scroll", "Scroll the page to reveal more content.", {
    direction: { type: "string", enum: ["up", "down"] },
    ref: { type: ["string", "null"], description: "Element to scroll into view, or null to scroll the page." },
    description: DESCRIPTION_PROP,
  }),
];

const APP_ACTION_TOOL = tool(
  "app_action",
  "Run a function the app provides (listed with the page under <app_actions>). Prefer this over clicking when an app action does exactly what's needed.",
  {
    action: { type: "string", description: "The app action's name, exactly as listed." },
    arguments_json: { type: "string", description: "Its arguments as a JSON object, e.g. {\"format\": \"pdf\"}. Use {} when it takes none." },
    description: DESCRIPTION_PROP,
    needs_confirmation: CONFIRM_PROP,
  },
);

const WAIT_FOR_USER_TOOL = tool(
  "wait_for_user",
  "Teach mode: point at an element, tell the user what to do with it, and wait until they've done it (or 2 minutes pass). Use one step at a time to walk someone through a task themselves.",
  {
    ref: REF_PROP,
    instruction: { type: "string", description: "What the user should do, e.g. \"Pick Excel here\"." },
    description: DESCRIPTION_PROP,
  },
);

export function toolsFor(mode: "agent" | "guide"): Anthropic.Beta.BetaTool[] {
  return mode === "agent" ? [...ACTION_TOOLS, APP_ACTION_TOOL, WAIT_FOR_USER_TOOL] : [WAIT_FOR_USER_TOOL];
}

export type ParsedToolUse =
  | { ok: true; action: AgentAction }
  | { ok: false; id: string; error: string };

/** Validates a tool call from the model and turns it into an action for the widget. */
export function parseToolUse(block: Anthropic.Beta.BetaToolUseBlock, mode: "agent" | "guide"): ParsedToolUse {
  const name = block.name as AgentActionName;
  const schema = inputSchemas[name];
  if (!schema || !toolsFor(mode).some((t) => t.name === name)) {
    return { ok: false, id: block.id, error: `Unknown tool ${block.name}.` };
  }
  const parsed = schema.safeParse(block.input);
  if (!parsed.success) {
    return { ok: false, id: block.id, error: `Invalid input: ${parsed.error.issues[0]?.message ?? "bad input"}. Try again.` };
  }
  const input = parsed.data as Record<string, unknown>;
  let args: Record<string, unknown> | undefined;
  if (name === "app_action") {
    try {
      const value: unknown = JSON.parse(String(input.arguments_json || "{}"));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
      args = value as Record<string, unknown>;
    } catch {
      return { ok: false, id: block.id, error: "arguments_json must be a JSON object. Try again." };
    }
  }
  const desc = String(input.description);
  const modelAsked = input.needs_confirmation === true;
  const action: AgentAction = {
    id: block.id,
    name,
    input: {
      description: desc,
      ref: typeof input.ref === "string" ? input.ref : undefined,
      text: typeof input.text === "string" ? input.text : undefined,
      submit: typeof input.submit === "boolean" ? input.submit : undefined,
      option: typeof input.option === "string" ? input.option : undefined,
      url: typeof input.path === "string" ? input.path : undefined,
      direction: input.direction === "up" || input.direction === "down" ? input.direction : undefined,
      instruction: typeof input.instruction === "string" ? input.instruction : undefined,
      actionName: typeof input.action === "string" ? input.action : undefined,
      args,
    },
    // The widget adds its own checks (the element's label, admin keywords) before acting.
    needsConfirmation: name !== "wait_for_user" && name !== "scroll" && (modelAsked || RISKY_ACTION_RE.test(desc)),
  };
  return { ok: true, action };
}
