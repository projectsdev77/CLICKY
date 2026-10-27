import { MAX_SNAPSHOT_CHARS } from "@clicky/shared/client";
import type { SdkInitResponse } from "@clicky/shared";
import { maskPII } from "./redact";

/**
 * Builds a compact, privacy-safe description of the current page for the
 * assistant: interactive elements (each with a ref like `e12` it can point at),
 * headings, and visible text. Passwords, `data-clicky-mask` elements, payment
 * fields and anything matching the project's mask selectors are replaced with
 * [masked]; `data-clicky-ignore` subtrees are left out entirely.
 */

export interface PageSnapshot {
  text: string;
  refs: Map<string, Element>;
}

type Masking = SdkInitResponse["masking"];

const INTERACTIVE = [
  "a[href]",
  "button",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "summary",
  "[role=button]",
  "[role=link]",
  "[role=tab]",
  "[role=menuitem]",
  "[role=checkbox]",
  "[role=switch]",
  "[role=option]",
  "[role=combobox]",
  "[contenteditable=true]",
].join(",");

const MAX_ELEMENTS = 250;
const MAX_TEXT = 6000;
const SKIP_TEXT_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "CLICKY-WIDGET"]);

function isVisible(el: Element): boolean {
  if (typeof el.checkVisibility === "function") {
    return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  }
  for (let node: Element | null = el; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if ((node as HTMLElement).hidden) return false;
  }
  return true;
}

function clean(text: string | null | undefined, max = 80): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function textOf(el: Element): string {
  return clean((el as HTMLElement).innerText ?? el.textContent);
}

export function accessibleName(el: Element): string {
  const aria = el.getAttribute("aria-label");
  if (aria) return clean(aria);
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .map((n) => textOf(n!))
      .join(" ");
    if (text) return clean(text);
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    const labels = el.labels ? Array.from(el.labels) : [];
    // Label text without the control's own text (e.g. a <select> nested in its <label>).
    const labelText = labels
      .map((label) => {
        const copy = label.cloneNode(true) as Element;
        copy.querySelectorAll("select, textarea, input").forEach((n) => n.remove());
        return clean(copy.textContent);
      })
      .filter(Boolean)
      .join(" ");
    if (labelText) return labelText;
    if ("placeholder" in el && el.placeholder) return clean(el.placeholder);
  }
  const text = textOf(el);
  if (text) return text;
  const img = el.querySelector("img[alt]");
  if (img) return clean(img.getAttribute("alt"));
  return clean(el.getAttribute("title") ?? el.getAttribute("name") ?? "");
}

export function roleOf(el: Element): string {
  const role = el.getAttribute("role");
  if (role) return role;
  const tag = el.tagName.toLowerCase();
  if (tag === "a") return "link";
  if (tag === "select") return "select";
  if (tag === "textarea") return "textbox";
  if (tag === "summary") return "button";
  if (tag === "input") {
    const type = (el as HTMLInputElement).type;
    if (["button", "submit", "reset", "image"].includes(type)) return "button";
    if (type === "checkbox" || type === "radio") return type;
    return "textbox";
  }
  if ((el as HTMLElement).isContentEditable) return "textbox";
  return tag;
}

export function isSensitive(el: Element, masking: Masking): boolean {
  if (el.closest("[data-clicky-mask]")) return true;
  for (const selector of masking.selectors) {
    try {
      if (el.closest(selector)) return true;
    } catch {
      // invalid selector from settings; ignore
    }
  }
  if (el instanceof HTMLInputElement) {
    if (el.type === "password") return true;
    const autocomplete = el.autocomplete ?? "";
    if (/^cc-|one-time-code|new-password|current-password/.test(autocomplete)) return true;
  }
  return false;
}

function describeValue(el: Element, masking: Masking): string {
  const sensitive = isSensitive(el, masking);
  const pii = (v: string) => (masking.maskPII ? maskPII(v) : v);
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox" || el.type === "radio") return el.checked ? " checked" : " unchecked";
    if (["button", "submit", "reset", "image"].includes(el.type)) return "";
    if (!el.value) return " (empty)";
    return sensitive ? " = [masked]" : ` = "${clean(pii(el.value), 60)}"`;
  }
  if (el instanceof HTMLTextAreaElement) {
    if (!el.value) return " (empty)";
    return sensitive ? " = [masked]" : ` = "${clean(pii(el.value), 120)}"`;
  }
  if (el instanceof HTMLSelectElement) {
    const options = Array.from(el.options)
      .slice(0, 15)
      .map((o) => clean(o.text, 40))
      .join(" | ");
    const selected = el.selectedOptions[0]?.text;
    return `${selected ? ` = "${clean(selected, 40)}"` : ""} options: ${options}`;
  }
  return "";
}

function describeState(el: Element): string {
  const states: string[] = [];
  if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") states.push("disabled");
  if (el.getAttribute("aria-current") && el.getAttribute("aria-current") !== "false") states.push("current");
  if (el.getAttribute("aria-selected") === "true") states.push("selected");
  const expanded = el.getAttribute("aria-expanded");
  if (expanded) states.push(expanded === "true" ? "expanded" : "collapsed");
  if (el instanceof HTMLAnchorElement && el.classList.contains("active")) states.push("current");
  return states.length ? ` (${states.join(", ")})` : "";
}

function visibleText(masking: Masking): string {
  const parts: string[] = [];
  let length = 0;
  const visibility = new Map<Element, boolean>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (SKIP_TEXT_TAGS.has(el.tagName.toUpperCase()) || el.hasAttribute("data-clicky-ignore")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let node = walker.nextNode(); node && length < MAX_TEXT; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent) continue;
    // Form controls are described in the element list instead.
    if (parent.closest("select, textarea, button, option")) continue;
    let visible = visibility.get(parent);
    if (visible === undefined) visibility.set(parent, (visible = isVisible(parent)));
    if (!visible) continue;
    let text = clean(node.textContent, 400);
    if (!text) continue;
    if (isSensitive(parent, masking)) text = "[masked]";
    else if (masking.maskPII) text = maskPII(text);
    if (parts[parts.length - 1] === "[masked]" && text === "[masked]") continue;
    parts.push(text);
    length += text.length + 1;
  }
  return parts.join(" ").slice(0, MAX_TEXT);
}

export function takeSnapshot(masking: Masking): PageSnapshot {
  const refs = new Map<string, Element>();
  const lines: string[] = [];

  const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
    .filter((h) => !h.closest("[data-clicky-ignore]") && isVisible(h))
    .slice(0, 20)
    .map((h) => `${h.tagName.toLowerCase()} "${textOf(h)}"`);
  if (headings.length) lines.push("Headings:", ...headings, "");

  lines.push("Interactive elements:");
  let n = 0;
  for (const el of Array.from(document.querySelectorAll(INTERACTIVE))) {
    if (n >= MAX_ELEMENTS) break;
    if (el.closest("[data-clicky-ignore]") || !isVisible(el)) continue;
    const name = accessibleName(el);
    const value = describeValue(el, masking);
    if (!name && !value) continue;
    const ref = `e${++n}`;
    refs.set(ref, el);
    const safeName = isSensitive(el, masking) || !masking.maskPII ? name : maskPII(name);
    lines.push(`[${ref}] ${roleOf(el)} "${safeName.replace(/"/g, "'")}"${value}${describeState(el)}`);
  }

  const text = visibleText(masking);
  if (text) lines.push("", "Visible text:", text);

  return { text: lines.join("\n").slice(0, MAX_SNAPSHOT_CHARS), refs };
}
