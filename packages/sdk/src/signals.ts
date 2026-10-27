import type { SdkEvent, SdkInitResponse } from "@clicky/shared";
import { maskPII } from "./redact";
import { accessibleName, isSensitive, roleOf } from "./snapshot";

/**
 * Lightweight struggle signals for the product team's friction map: page views,
 * rage clicks, dead clicks, form errors and people stuck on a form. Events carry
 * the page path and a redacted element description, never field values.
 * Batched and sent every few seconds, and with sendBeacon when the tab hides.
 */

const FLUSH_MS = 10_000;
const RAGE_CLICKS = 3;
const RAGE_WINDOW_MS = 800;
const RAGE_RADIUS = 40;
const DEAD_CLICK_MS = 1000;
const STUCK_MS = 45_000;

type Masking = SdkInitResponse["masking"];

function sessionId(): string {
  try {
    let id = sessionStorage.getItem("clicky:sid");
    if (!id) sessionStorage.setItem("clicky:sid", (id = crypto.randomUUID()));
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function describeElement(el: Element, masking: Masking): string {
  const role = roleOf(el);
  if (isSensitive(el, masking)) return role;
  const name = accessibleName(el).slice(0, 80);
  return name ? `${role} "${masking.maskPII ? maskPII(name) : name}"` : role;
}

const INTERACTIVE = "a[href], button, input, select, textarea, label, summary, [role=button], [role=link], [role=tab], [role=menuitem], [onclick], [contenteditable=true]";

export class SignalTracker {
  private queue: SdkEvent[] = [];
  private timer = 0;
  private clicks: { x: number; y: number; t: number }[] = [];
  private lastPath = "";
  private stuckTimers = new Map<HTMLFormElement, number>();
  private teardown: (() => void)[] = [];
  private readonly sid = sessionId();

  constructor(
    private send: (body: { sessionId: string; events: SdkEvent[] }, beacon: boolean) => void,
    private masking: Masking,
  ) {
    this.pageview();
    this.listen(window, "popstate", () => this.pageview());
    for (const method of ["pushState", "replaceState"] as const) {
      const original = history[method];
      history[method] = function (this: History, ...args: Parameters<History["pushState"]>) {
        const result = original.apply(this, args);
        window.dispatchEvent(new Event("clicky:navigate"));
        return result;
      } as History["pushState"];
      this.teardown.push(() => (history[method] = original));
    }
    this.listen(window, "clicky:navigate", () => this.pageview());
    this.listen(document, "click", (e) => this.onClick(e as MouseEvent), true);
    this.listen(document, "invalid", (e) => this.onInvalid(e), true);
    this.listen(document, "focusin", (e) => this.onFocus(e), true);
    this.listen(document, "submit", (e) => this.clearStuck(e.target as HTMLFormElement), true);
    this.listen(document, "visibilitychange", () => {
      if (document.visibilityState === "hidden") this.flush(true);
    });
    this.watchErrors();
    this.timer = window.setInterval(() => this.flush(false), FLUSH_MS);
  }

  /** Custom event from Clicky.track(). */
  track(name: string, props: Record<string, string | number | boolean | null> = {}) {
    this.push("custom", null, { ...props, name: name.slice(0, 100) });
  }

  destroy() {
    this.flush(true);
    clearInterval(this.timer);
    this.stuckTimers.forEach((t) => clearTimeout(t));
    this.teardown.forEach((fn) => fn());
  }

  private listen(target: EventTarget, type: string, handler: (e: Event) => void, capture = false) {
    target.addEventListener(type, handler, capture);
    this.teardown.push(() => target.removeEventListener(type, handler, capture));
  }

  private push(type: SdkEvent["type"], element: string | null, props?: SdkEvent["props"]) {
    this.queue.push({ type, path: location.pathname, element, props, at: Date.now() });
    if (this.queue.length >= 50) this.flush(false);
  }

  private flush(beacon: boolean) {
    if (!this.queue.length) return;
    const events = this.queue.splice(0, 50);
    this.send({ sessionId: this.sid, events }, beacon);
  }

  private pageview() {
    if (location.pathname === this.lastPath) return;
    this.lastPath = location.pathname;
    this.push("pageview", null);
  }

  private onClick(e: MouseEvent) {
    const target = e.target as Element | null;
    if (!target || e.composedPath().some((n) => (n as Element).tagName === "CLICKY-WIDGET")) return;
    const now = Date.now();
    this.clicks = this.clicks.filter((c) => now - c.t < RAGE_WINDOW_MS && Math.hypot(c.x - e.clientX, c.y - e.clientY) < RAGE_RADIUS);
    this.clicks.push({ x: e.clientX, y: e.clientY, t: now });
    if (this.clicks.length === RAGE_CLICKS) {
      this.push("rage_click", describeElement(target, this.masking));
    }
    this.checkDeadClick(target);
  }

  /** A click on something that looks clickable but where nothing happens. */
  private checkDeadClick(target: Element) {
    if (target.closest("input, select, textarea, label, [contenteditable=true]")) return;
    const clickable = target.closest(INTERACTIVE) ?? (getComputedStyle(target).cursor === "pointer" ? target : null);
    if (!clickable || (clickable as HTMLButtonElement).disabled) return;
    const url = location.href;
    let changed = false;
    const observer = new MutationObserver(() => (changed = true));
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    const onHide = () => (changed = true);
    window.addEventListener("pagehide", onHide, { once: true });
    setTimeout(() => {
      observer.disconnect();
      window.removeEventListener("pagehide", onHide);
      if (!changed && location.href === url) this.push("dead_click", describeElement(clickable, this.masking));
    }, DEAD_CLICK_MS);
  }

  private onInvalid(e: Event) {
    const el = e.target as Element;
    const validity = (el as HTMLInputElement).validity;
    const reason = validity?.valueMissing ? "required" : validity?.typeMismatch ? "format" : "invalid";
    this.push("form_error", describeElement(el, this.masking), { reason });
  }

  /** Error messages that appear on the page (role=alert, .error, aria-invalid fields). */
  private watchErrors() {
    const seen = new WeakSet<Node>();
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.attributeName === "aria-invalid") {
          const el = m.target as Element;
          if (el.getAttribute("aria-invalid") === "true") this.push("form_error", describeElement(el, this.masking), { reason: "aria-invalid" });
          continue;
        }
        m.addedNodes.forEach((node) => {
          if (!(node instanceof Element) || seen.has(node) || node.closest("clicky-widget, [data-clicky-ignore]")) return;
          if (node.matches('[role=alert], .error, .errors, [class*="error-message"]')) {
            seen.add(node);
            const text = (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
            if (text) this.push("form_error", `message "${this.masking.maskPII ? maskPII(text) : text}"`, { reason: "message" });
          }
        });
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-invalid"] });
    this.teardown.push(() => observer.disconnect());
  }

  /** Someone who starts filling in a form and hasn't submitted it after a while. */
  private onFocus(e: Event) {
    const form = (e.target as Element).closest?.("form");
    if (!form || this.stuckTimers.has(form)) return;
    const path = location.pathname;
    this.stuckTimers.set(
      form,
      window.setTimeout(() => {
        if (location.pathname !== path || !form.isConnected) return;
        const label = form.getAttribute("aria-label") ?? form.querySelector("h1, h2, h3, legend")?.textContent?.trim() ?? "";
        this.push("form_stuck", label ? `form "${label.slice(0, 60)}"` : "form", { seconds: STUCK_MS / 1000 });
      }, STUCK_MS),
    );
  }

  private clearStuck(form: HTMLFormElement) {
    clearTimeout(this.stuckTimers.get(form));
  }
}
