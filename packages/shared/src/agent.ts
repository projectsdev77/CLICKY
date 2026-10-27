/**
 * Agent mode: the assistant asks the widget to act on the page through these
 * actions. The server decides what to do; the browser does it, visibly, with the
 * user's own permissions, and reports back.
 */

export type AgentActionName = "click" | "type" | "select" | "navigate" | "scroll" | "wait_for_user" | "app_action";

export interface AgentAction {
  /** tool_use id; results are matched back by it. */
  id: string;
  name: AgentActionName;
  input: {
    /** Short label shown to the user, e.g. "Click Export". */
    description: string;
    ref?: string;
    text?: string;
    submit?: boolean;
    option?: string;
    url?: string;
    direction?: "up" | "down";
    instruction?: string;
    /** app_action: which registered action to run, and its arguments. */
    actionName?: string;
    args?: Record<string, unknown>;
  };
  /** The model or our heuristics think the user should approve this first. */
  needsConfirmation: boolean;
}

export type ActionStatus = "done" | "failed" | "declined" | "blocked" | "skipped" | "timeout";

export interface ActionResult {
  id: string;
  status: ActionStatus;
  /** What happened, in plain words, for the model (e.g. validation errors that appeared). */
  output: string;
}

/** Words that make an action worth confirming even if the model didn't ask. */
export const RISKY_ACTION_RE =
  /\b(delete|remove|destroy|erase|pay|purchase|buy|checkout|order|send|publish|transfer|cancel|unsubscribe|upgrade|downgrade|refund|deactivate|revoke|reset|update card|switch to)\b/i;

/**
 * Glob-style path matching for admin-blocked pages: `*` matches within one path
 * segment, `**` across segments. "/admin" also blocks "/admin/" and "/admin/x"
 * only when written as "/admin/**" or "/admin*".
 */
export function matchesPathPattern(pattern: string, pathname: string): boolean {
  const trimmed = pattern.trim();
  if (!trimmed) return false;
  const regex = trimmed
    .split("**")
    .map((part) =>
      part
        .split("*")
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*"),
    )
    .join(".*");
  return new RegExp(`^${regex}/?$`).test(pathname);
}

export function isPathBlocked(patterns: readonly string[], pathname: string): boolean {
  return patterns.some((p) => matchesPathPattern(p, pathname));
}

/** A function the host app exposes to Clicky with Clicky.registerAction(). */
export interface AppActionInfo {
  name: string;
  description: string;
  /** JSON-Schema-style description of the arguments: { properties, required }. */
  parameters?: { properties?: Record<string, { type?: string; description?: string; enum?: unknown[] }>; required?: string[] };
  /** Always ask the user before running it. */
  confirm?: boolean;
}

export const APP_ACTION_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/;
