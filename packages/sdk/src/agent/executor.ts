import { isPathBlocked, type ActionResult, type AgentAction } from "@clicky/shared/client";
import type { SdkInitResponse } from "@clicky/shared";
import type { Pointer } from "../pointer";
import { maskPII } from "../redact";
import { isSensitive } from "../snapshot";

/**
 * Carries out one action on the page, the way a person would: the pointer moves
 * to the element first, then it's clicked/typed into, and we wait for the page
 * to settle before describing what changed. Never throws.
 */

export interface ExecContext {
  refs: Map<string, Element>;
  pointer: Pointer;
  config: Pick<SdkInitResponse, "masking" | "behavior">;
  signal: AbortSignal;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });

/** Resolves once the DOM has been quiet for `quietMs` (or after `maxMs`). */
export function settle(quietMs = 300, maxMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    let quiet = setTimeout(done, quietMs);
    const max = setTimeout(done, maxMs);
    const observer = new MutationObserver(() => {
      clearTimeout(quiet);
      quiet = setTimeout(done, quietMs);
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    function done() {
      observer.disconnect();
      clearTimeout(quiet);
      clearTimeout(max);
      resolve();
    }
  });
}

const MESSAGE_SELECTOR =
  '[role=alert], [role=status], [aria-live], [aria-invalid="true"], .error, .errors, .notice, .toast, [class*="error-message"], [class*="toast"], [class*="alert"]';

/** Visible status/error messages on the page, so we can report which ones appeared after an action. */
function pageMessages(): Set<string> {
  const out = new Set<string>();
  for (const el of Array.from(document.querySelectorAll(MESSAGE_SELECTOR))) {
    if (el.closest("clicky-widget, [data-clicky-ignore]")) continue;
    const text =
      el.getAttribute("aria-invalid") === "true"
        ? `${el.getAttribute("aria-label") ?? (el as HTMLInputElement).name ?? "A field"} is marked invalid`
        : ((el as HTMLElement).innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text && text.length < 300 && (el as HTMLElement).offsetParent !== null) out.add(text);
  }
  return out;
}

function label(el: Element) {
  return ((el as HTMLElement).innerText || el.getAttribute("aria-label") || el.getAttribute("name") || "it")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/** Sets a form value in a way frameworks like React notice. */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

async function show(el: Element, ctx: ExecContext) {
  ctx.pointer.pointAt(el, 2500);
  await sleep(matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 100 : 550, ctx.signal);
}

/** Why this action isn't allowed here (admin-blocked page), or null. */
export function blockedReason(action: AgentAction, config: Pick<SdkInitResponse, "behavior">): string | null {
  if (action.name === "wait_for_user" || action.name === "scroll") return null;
  if (isPathBlocked(config.behavior.blockedPaths, location.pathname)) {
    return "Actions are turned off on this page by the app's team. Tell the user how to do it themselves.";
  }
  return null;
}

export async function executeAction(action: AgentAction, ctx: ExecContext): Promise<ActionResult> {
  const result = (status: ActionResult["status"], output: string): ActionResult => ({ id: action.id, status, output });
  const { input } = action;
  if (ctx.signal.aborted) return result("skipped", "Stopped by the user.");

  const blocked = blockedReason(action, ctx.config);
  if (blocked) return result("blocked", blocked);

  let el: Element | undefined;
  if (input.ref) {
    el = ctx.refs.get(input.ref);
    if (!el?.isConnected) return result("failed", `Element ${input.ref} is no longer on the page.`);
  }

  const beforeUrl = location.href;
  const beforeMessages = pageMessages();
  try {
    switch (action.name) {
      case "click": {
        if (!el) return result("failed", "No element given.");
        await show(el, ctx);
        if ((el as HTMLButtonElement).disabled) return result("failed", `${label(el)} is disabled.`);
        (el as HTMLElement).focus?.({ preventScroll: true });
        (el as HTMLElement).click();
        break;
      }
      case "type": {
        if (!el) return result("failed", "No element given.");
        if (isSensitive(el, ctx.config.masking)) {
          return result("blocked", "That's a password, payment or private field. Ask the user to fill it in themselves.");
        }
        await show(el, ctx);
        const text = input.text ?? "";
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          el.focus({ preventScroll: true });
          setNativeValue(el, text);
        } else if ((el as HTMLElement).isContentEditable) {
          (el as HTMLElement).focus();
          el.textContent = text;
          el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
        } else {
          return result("failed", `${label(el)} isn't a text field.`);
        }
        if (input.submit) {
          const init = { key: "Enter", code: "Enter", bubbles: true, cancelable: true };
          const proceed = el.dispatchEvent(new KeyboardEvent("keydown", init));
          el.dispatchEvent(new KeyboardEvent("keyup", init));
          const form = el.closest("form");
          if (proceed && form) form.requestSubmit();
        }
        break;
      }
      case "select": {
        if (!(el instanceof HTMLSelectElement)) return result("failed", "That isn't a dropdown; try clicking it instead.");
        await show(el, ctx);
        const wanted = (input.option ?? "").trim().toLowerCase();
        const options = Array.from(el.options);
        const option =
          options.find((o) => o.text.trim().toLowerCase() === wanted || o.value.toLowerCase() === wanted) ??
          options.find((o) => o.text.toLowerCase().includes(wanted));
        if (!option) {
          return result("failed", `No option "${input.option}". Options are: ${options.map((o) => o.text).join(", ")}.`);
        }
        el.focus({ preventScroll: true });
        setNativeValue(el, option.value);
        break;
      }
      case "navigate": {
        const target = new URL(input.url ?? "/", location.href);
        if (target.origin !== location.origin) return result("failed", "Can only go to pages on this site.");
        if (isPathBlocked(ctx.config.behavior.blockedPaths, target.pathname)) {
          return result("blocked", "That page is off-limits for Clicky. Tell the user how to get there.");
        }
        location.assign(target.toString());
        await sleep(3000, ctx.signal); // normally the page unloads first
        break;
      }
      case "scroll": {
        if (el) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
          ctx.pointer.pointAt(el, 2500);
        } else {
          scrollBy({ top: (input.direction === "up" ? -0.8 : 0.8) * innerHeight, behavior: "smooth" });
        }
        await sleep(500, ctx.signal);
        break;
      }
      case "wait_for_user": {
        if (!el) return result("failed", "No element given.");
        const outcome = await waitForUser(el, ctx);
        if (outcome === "timeout") return result("timeout", "The user hasn't done it yet (2 minutes).");
        if (outcome === "stopped") return result("skipped", "Stopped by the user.");
        break;
      }
    }
  } catch (error) {
    return result("failed", error instanceof Error ? error.message : "Something went wrong.");
  }

  await settle();
  const notes: string[] = [];
  if (location.href !== beforeUrl) notes.push(`The page is now ${location.pathname}.`);
  const fresh = Array.from(pageMessages()).filter((m) => !beforeMessages.has(m));
  if (fresh.length) {
    const text = fresh.slice(0, 4).map((m) => `"${m}"`).join("; ");
    notes.push(`New message on the page: ${ctx.config.masking.maskPII ? maskPII(text) : text}.`);
  }
  const what = action.name === "wait_for_user" ? "The user did it." : `${input.description}: done.`;
  return result("done", [what, ...notes].join(" "));
}

/** Teach mode: point at `el` and wait for the user to interact with it (or leave the page). */
function waitForUser(el: Element, ctx: ExecContext): Promise<"done" | "timeout" | "stopped"> {
  ctx.pointer.pointAt(el, 120_000);
  return new Promise((resolve) => {
    const startUrl = location.href;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const finish = (outcome: "done" | "timeout" | "stopped") => {
      document.removeEventListener("click", onClick, true);
      el.removeEventListener("change", onChange);
      el.removeEventListener("input", onInput);
      clearInterval(poll);
      clearTimeout(timeout);
      clearTimeout(idle);
      if (outcome !== "done") ctx.pointer.hide();
      resolve(outcome);
    };
    const onClick = (e: Event) => {
      if (e.composedPath().includes(el) && !(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) {
        setTimeout(() => finish("done"), 50);
      }
    };
    const onChange = () => finish("done");
    // Text fields: done once the user pauses typing.
    const onInput = () => {
      clearTimeout(idle);
      idle = setTimeout(() => finish("done"), 1500);
    };
    document.addEventListener("click", onClick, true);
    el.addEventListener("change", onChange);
    el.addEventListener("input", onInput);
    const poll = setInterval(() => {
      if (location.href !== startUrl) finish("done");
    }, 300);
    const timeout = setTimeout(() => finish("timeout"), 120_000);
    ctx.signal.addEventListener("abort", () => finish("stopped"));
  });
}

/** Should the user approve this step first? Server hint, risky wording on the element, or the admin's keywords. */
export function needsConfirmation(action: AgentAction, ctx: Pick<ExecContext, "refs" | "config">, riskyRe: RegExp): boolean {
  if (action.name === "wait_for_user" || action.name === "scroll") return false;
  if (action.needsConfirmation) return true;
  const el = action.input.ref ? ctx.refs.get(action.input.ref) : undefined;
  const text = `${action.input.description} ${el ? label(el) : ""}`.toLowerCase();
  if (riskyRe.test(text)) return true;
  if (el?.closest("form") && el.getAttribute("type") === "submit" && el.closest("form")!.querySelector('[autocomplete^="cc-"]')) {
    return true;
  }
  return ctx.config.behavior.confirmKeywords.some((k) => k.trim() && text.includes(k.trim().toLowerCase()));
}
