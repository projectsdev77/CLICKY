import { t } from "./i18n";
import type { SdkInitResponse } from "@clicky/shared";
import { Pointer, POINTER_STYLES } from "./pointer";

export type WidgetStatus = "idle" | "listening" | "thinking" | "speaking";

export interface WidgetHandlers {
  onSubmit(text: string): void;
  onMicDown(): void;
  onMicUp(): void;
  onMuteToggle(): void;
  onOpenChange(open: boolean): void;
}

export interface MessageHandle {
  append(text: string): void;
  remove(): void;
  setText(text: string): void;
  get text(): string;
}

export type StepStatus = "pending" | "running" | "waiting" | "done" | "failed" | "declined" | "blocked" | "skipped" | "timeout";

export interface StepRow {
  setStatus(status: StepStatus, note?: string): void;
}

export interface StepsHandle {
  add(description: string): StepRow;
}

export interface Widget {
  host: HTMLElement;
  pointer: Pointer;
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  addMessage(role: "user" | "assistant", text?: string): MessageHandle;
  setStatus(status: WidgetStatus, caption?: string): void;
  setMuted(muted: boolean): void;
  setVoiceAvailable(available: boolean): void;
  /** A list of agent steps, shown in the conversation. */
  addSteps(): StepsHandle;
  /** Asks the user to approve a step. `result` resolves true (Allow) or false (Don't); `answer` settles it from elsewhere (voice). */
  confirm(question: string): { result: Promise<boolean>; answer(value: boolean): void };
  /** Shows "Helpful? 👍 👎" under the latest reply (replacing any earlier one). */
  showFeedback(onRate: (rating: 1 | -1) => void): void;
  /** Suggestion chips in an empty chat (an empty list removes them). */
  setSuggestions(items: { label: string; ask: string }[], onPick: (question: string) => void): void;
  /** A small "need a hand?" bubble above the launcher (while the panel is closed). */
  showNudge(text: string, onAccept: () => void, onDismiss: () => void): void;
  /** Shows a "Talk to a person" link at the bottom of the panel. */
  setHandoff(label: string | null, onClick: () => void): void;
  /** The onboarding checklist at the top of the panel (null removes it). */
  setChecklist(
    checklist: { title: string; steps: { id: string; title: string; done: boolean }[] } | null,
    handlers?: { onShowMe(stepId: string): void; onHide(): void },
  ): void;
  /** Shows a Stop button while an agent run is in progress (null hides it). */
  setRunning(onStop: (() => void) | null): void;
  destroy(): void;
}

const STYLES = /* css */ `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .light { --bg: #fff; --fg: #18181b; --muted: #5f5f68; --border: #e4e4e7; --soft: #f4f4f5; }
  .dark { --bg: #18181b; --fg: #fafafa; --muted: #a1a1aa; --border: #3f3f46; --soft: #27272a; }
  .root { position: fixed; bottom: 20px; z-index: 2147483000; display: flex; flex-direction: column; gap: 12px; }
  .root.right { right: 20px; align-items: flex-end; }
  .root.left { left: 20px; align-items: flex-start; }
  button { font: inherit; cursor: pointer; }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }

  .launcher {
    position: relative; width: 54px; height: 54px; border-radius: 999px; border: 0; color: #fff;
    background: var(--brand); box-shadow: 0 6px 20px rgba(0,0,0,.22);
    display: grid; place-items: center; transition: transform .15s ease;
  }
  .launcher:hover { transform: scale(1.05); }
  .launcher::after { content: ""; position: absolute; inset: -5px; border-radius: inherit; border: 3px solid transparent; }
  [data-status=listening] .launcher::after { border-color: #ef4444; animation: pulse 1s ease-in-out infinite; }
  [data-status=thinking] .launcher::after { border-color: var(--brand) transparent; animation: spin .9s linear infinite; }
  [data-status=speaking] .launcher::after { border-color: color-mix(in srgb, var(--brand) 60%, #fff); animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { transform: scale(1.12); opacity: .5; } }
  @keyframes spin { to { transform: rotate(360deg); } }

  .panel {
    width: min(380px, calc(100vw - 32px)); max-height: min(560px, calc(100vh - 110px));
    display: flex; flex-direction: column; border-radius: 16px; overflow: hidden;
    background: var(--bg); color: var(--fg); border: 1px solid var(--border);
    box-shadow: 0 16px 48px rgba(0,0,0,.2); font-size: 14px; line-height: 1.5;
  }
  .panel[hidden] { display: none; }
  .header { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--border); }
  .title { font-weight: 600; flex: 1; }
  .dot { width: 8px; height: 8px; border-radius: 99px; background: #22c55e; }
  [data-status=listening] .dot { background: #ef4444; }
  [data-status=thinking] .dot, [data-status=speaking] .dot { background: var(--brand); }
  .icon-btn { border: 0; background: transparent; color: var(--muted); padding: 4px; border-radius: 6px; display: grid; place-items: center; }
  .icon-btn:hover { background: var(--soft); color: var(--fg); }

  .log { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; min-height: 120px; }
  .msg { max-width: 88%; padding: 8px 12px; border-radius: 14px; white-space: pre-wrap; word-wrap: break-word; }
  .msg.user { align-self: flex-end; background: var(--brand); color: var(--on-brand); border-bottom-right-radius: 4px; }
  .msg.assistant { align-self: flex-start; background: var(--soft); border-bottom-left-radius: 4px; }
  .msg.assistant:empty::after { content: "…"; color: var(--muted); }
  .greeting { color: var(--muted); }

  .caption { padding: 0 14px; min-height: 0; color: var(--muted); font-style: italic; }
  .caption:not(:empty) { padding-bottom: 8px; }
  .composer { display: flex; gap: 8px; padding: 10px; border-top: 1px solid var(--border); }
  .composer input {
    flex: 1; min-width: 0; border: 1px solid var(--border); background: var(--bg); color: var(--fg);
    border-radius: 10px; padding: 8px 10px; font: inherit; outline: none;
  }
  .mic, .send { width: 38px; height: 38px; border-radius: 10px; border: 0; display: grid; place-items: center; }
  .mic { background: var(--soft); color: var(--fg); }
  [data-status=listening] .mic { background: #ef4444; color: #fff; }
  .mic[hidden] { display: none; }
  .send { background: var(--brand); color: var(--on-brand); }
  .hint { padding: 0 14px 10px; color: var(--muted); font-size: 12px; }
  .steps { align-self: stretch; list-style: none; margin: 0; padding: 8px 10px; border: 1px solid var(--border); border-radius: 12px; font-size: 13px; display: flex; flex-direction: column; gap: 4px; }
  .step { display: flex; gap: 8px; align-items: baseline; }
  .step .icon { width: 14px; flex: none; text-align: center; color: var(--muted); }
  .step[data-status=running] .icon, .step[data-status=waiting] .icon { color: var(--brand); }
  .step[data-status=done] .icon { color: #16a34a; }
  .step[data-status=failed] .icon, .step[data-status=blocked] .icon, .step[data-status=timeout] .icon { color: #dc2626; }
  .step .note { display: block; color: var(--muted); font-size: 12px; }
  .confirm { align-self: stretch; border: 1px solid var(--brand); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
  .confirm .actions { display: flex; gap: 8px; }
  .confirm button { border-radius: 8px; padding: 6px 12px; border: 1px solid var(--border); background: var(--bg); color: var(--fg); }
  .confirm button.allow { background: var(--brand); border-color: var(--brand); color: var(--on-brand); }
  .confirm.answered { opacity: .7; }
  .feedback { align-self: flex-start; display: flex; gap: 4px; align-items: center; color: var(--muted); font-size: 12px; margin-top: -4px; }
  .feedback button { border: 0; background: transparent; padding: 2px 6px; border-radius: 6px; font-size: 14px; color: var(--muted); }
  .feedback button:hover { background: var(--soft); }
  .nudge {
    max-width: 260px; display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: 14px;
    background: var(--bg); color: var(--fg); border: 1px solid var(--border); box-shadow: 0 8px 24px rgba(0,0,0,.16); font-size: 14px;
  }
  .nudge[hidden] { display: none; }
  .nudge .row { display: flex; gap: 8px; }
  .nudge button { border-radius: 8px; padding: 4px 10px; border: 1px solid var(--border); background: var(--bg); color: var(--fg); }
  .nudge button.yes { background: var(--brand); border-color: var(--brand); color: var(--on-brand); }
  .footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 0 14px 10px; }
  .footer .hint { padding: 0; }
  .handoff { border: 0; background: transparent; color: var(--fg); text-decoration: underline; font-size: 12px; padding: 0; }
  .handoff[hidden] { display: none; }
  .checklist { padding: 10px 14px; border-bottom: 1px solid var(--border); font-size: 13px; }
  .checklist[hidden] { display: none; }
  .checklist .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .checklist .title { font-weight: 600; font-size: 13px; margin: 0; }
  .checklist ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .checklist li { display: flex; align-items: center; gap: 8px; }
  .checklist li .mark { width: 16px; height: 16px; border-radius: 99px; border: 1.5px solid var(--border); display: grid; place-items: center; font-size: 10px; flex: none; }
  .checklist li.done .mark { background: var(--brand); border-color: var(--brand); color: var(--on-brand); }
  .checklist li.done .label { color: var(--muted); text-decoration: line-through; }
  .checklist li .label { flex: 1; }
  .checklist button { border: 1px solid var(--border); background: var(--bg); color: var(--fg); border-radius: 6px; padding: 2px 8px; font-size: 12px; }
  .checklist .hide { border: 0; padding: 0; color: var(--muted); text-decoration: underline; }
  .badge { position: absolute; top: 2px; right: 2px; width: 12px; height: 12px; border-radius: 99px; background: #ef4444; border: 2px solid #fff; }
  .badge[hidden] { display: none; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chips button { border: 1px solid var(--border); background: var(--bg); color: var(--fg); border-radius: 999px; padding: 4px 10px; font-size: 13px; text-align: left; }
  .chips button:hover { background: var(--soft); }
  .stop { border: 1px solid var(--border); background: var(--bg); color: var(--fg); border-radius: 8px; padding: 2px 10px; font-size: 12px; }
  .stop[hidden] { display: none; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  @media (prefers-reduced-motion: reduce) { .launcher, .launcher::after { transition: none; animation: none !important; } }
  ${POINTER_STYLES}
`;

const ICONS = {
  logo: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 4l7.07 17 2.51-7.39L21 11.07z"/></svg>`,
  mic: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/></svg>`,
  send: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  sound: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>`,
  muted: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6"/></svg>`,
  close: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, html?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
}

/** White or near-black, whichever reads better on the customer's brand color (WCAG contrast). */
export function textOnColor(hex: string): string {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const onWhite = 1.05 / (luminance + 0.05);
  const onDark = (luminance + 0.05) / (0.0137 + 0.05); // #18181b
  return onWhite >= onDark ? "#ffffff" : "#18181b";
}

function resolveTheme(theme: SdkInitResponse["appearance"]["theme"]) {
  if (theme !== "auto") return theme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const HOTKEY_LABEL = isMac ? "⌥ Space" : "Alt+Space";

/** Mounts the launcher, chat panel and pointer inside a Shadow DOM so host styles can't leak in or out. */
export function mountWidget(config: SdkInitResponse, handlers: WidgetHandlers): Widget {
  const { appearance } = config;
  const host = document.createElement("clicky-widget");
  const shadow = host.attachShadow({ mode: "open" });
  const style = el("style");
  style.textContent = STYLES;

  const theme = resolveTheme(appearance.theme);
  const wrapper = el("div", theme);
  wrapper.dataset.status = "idle";
  wrapper.style.setProperty("--brand", appearance.brandColor);
  wrapper.style.setProperty("--on-brand", textOnColor(appearance.brandColor));
  const root = el("div", `root ${appearance.position === "bottom-left" ? "left" : "right"}`);

  // Panel
  const panel = el("div", "panel");
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", appearance.assistantName);

  const header = el("div", "header");
  const dot = el("span", "dot");
  const title = el("span", "title");
  title.textContent = appearance.assistantName;
  const muteBtn = el("button", "icon-btn", ICONS.sound);
  muteBtn.type = "button";
  muteBtn.setAttribute("aria-label", t("mute"));
  const closeBtn = el("button", "icon-btn", ICONS.close);
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", t("close", { name: appearance.assistantName }));
  const stopBtn = el("button", "stop");
  stopBtn.type = "button";
  stopBtn.textContent = t("stop");
  stopBtn.hidden = true;
  let onStop: (() => void) | null = null;
  stopBtn.addEventListener("click", () => onStop?.());
  header.append(dot, title, stopBtn, muteBtn, closeBtn);

  const checklistEl = el("div", "checklist");
  checklistEl.hidden = true;
  const log = el("div", "log");
  log.setAttribute("role", "log");
  log.setAttribute("aria-live", "polite");
  const greeting = el("div", "msg assistant greeting");
  greeting.textContent = appearance.greeting;
  log.append(greeting);

  const caption = el("div", "caption");
  caption.setAttribute("aria-live", "polite");

  const composer = el("form", "composer");
  const input = el("input");
  input.type = "text";
  input.placeholder = t("askPlaceholder");
  input.setAttribute("aria-label", t("ask", { name: appearance.assistantName }));
  input.maxLength = 2000;
  const mic = el("button", "mic", ICONS.mic);
  mic.type = "button";
  mic.setAttribute("aria-label", t("talk"));
  const send = el("button", "send", ICONS.send);
  send.type = "submit";
  send.setAttribute("aria-label", t("send"));
  composer.append(input, mic, send);

  const hint = el("div", "hint");
  const handoffBtn = el("button", "handoff");
  handoffBtn.type = "button";
  handoffBtn.hidden = true;
  let onHandoff: () => void = () => {};
  handoffBtn.addEventListener("click", () => onHandoff());
  const footer = el("div", "footer");
  footer.append(hint, handoffBtn);
  panel.append(header, checklistEl, log, caption, composer, footer);

  const nudge = el("div", "nudge");
  nudge.hidden = true;
  nudge.setAttribute("role", "status");
  const nudgeText = el("div");
  const nudgeRow = el("div", "row");
  const nudgeYes = el("button", "yes");
  nudgeYes.type = "button";
  nudgeYes.textContent = t("nudgeYes");
  const nudgeNo = el("button");
  nudgeNo.type = "button";
  nudgeNo.textContent = t("nudgeNo");
  nudgeRow.append(nudgeYes, nudgeNo);
  nudge.append(nudgeText, nudgeRow);
  let nudgeHandlers: { accept(): void; dismiss(): void } | null = null;
  nudgeYes.addEventListener("click", () => {
    nudge.hidden = true;
    nudgeHandlers?.accept();
  });
  nudgeNo.addEventListener("click", () => {
    nudge.hidden = true;
    nudgeHandlers?.dismiss();
  });

  const launcher = el("button", "launcher", ICONS.logo);
  launcher.type = "button";
  launcher.setAttribute("aria-label", t("open", { name: appearance.assistantName }));
  launcher.setAttribute("aria-expanded", "false");
  const badge = el("span", "badge");
  badge.hidden = true;
  badge.setAttribute("aria-hidden", "true");
  launcher.append(badge);

  const pointerLayer = el("div", "ptr-layer");
  root.append(panel, nudge, launcher);
  wrapper.append(root, pointerLayer);
  shadow.append(style, wrapper);
  document.body.append(host);

  const pointer = new Pointer(pointerLayer, () => launcher.getBoundingClientRect());

  let isOpen = false;
  const setOpen = (open: boolean) => {
    if (open === isOpen) return;
    isOpen = open;
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    launcher.setAttribute("aria-label", t(open ? "close" : "open", { name: appearance.assistantName }));
    if (open) {
      log.scrollTop = log.scrollHeight;
      nudge.hidden = true;
    }
    handlers.onOpenChange(open);
  };

  launcher.addEventListener("click", () => setOpen(!isOpen));
  closeBtn.addEventListener("click", () => setOpen(false));
  muteBtn.addEventListener("click", () => handlers.onMuteToggle());
  composer.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    handlers.onSubmit(text);
  });

  // Mic: hold to talk, or tap to start and tap again to stop.
  let pressedAt = 0;
  let toggled = false;
  mic.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (toggled) {
      toggled = false;
      handlers.onMicUp();
      return;
    }
    pressedAt = Date.now();
    handlers.onMicDown();
  });
  const release = () => {
    if (!pressedAt) return;
    const held = Date.now() - pressedAt;
    pressedAt = 0;
    if (held > 350) handlers.onMicUp();
    else toggled = true;
  };
  mic.addEventListener("pointerup", release);
  mic.addEventListener("pointerleave", release);
  mic.addEventListener("click", (e) => {
    if (e.detail !== 0) return; // keyboard activation only; pointer handled above
    if (toggled) {
      toggled = false;
      handlers.onMicUp();
    } else {
      toggled = true;
      handlers.onMicDown();
    }
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && isOpen) {
      pointer.hide();
      setOpen(false);
    }
  };
  document.addEventListener("keydown", onKey);

  const addMessage = (role: "user" | "assistant", text = ""): MessageHandle => {
    const node = el("div", `msg ${role}`);
    node.textContent = text;
    log.append(node);
    log.scrollTop = log.scrollHeight;
    return {
      append(more) {
        node.textContent += more;
        log.scrollTop = log.scrollHeight;
      },
      setText(value) {
        node.textContent = value;
        log.scrollTop = log.scrollHeight;
      },
      remove() {
        node.remove();
      },
      get text() {
        return node.textContent ?? "";
      },
    };
  };

  const STEP_ICONS: Record<StepStatus, string> = {
    pending: "○",
    running: "◐",
    waiting: "☛",
    done: "✓",
    failed: "✕",
    declined: "–",
    blocked: "⊘",
    skipped: "–",
    timeout: "…",
  };

  const addSteps = (): StepsHandle => {
    const list = el("ol", "steps");
    list.setAttribute("aria-label", "Steps");
    log.append(list);
    return {
      add(description) {
        const row = el("li", "step");
        const icon = el("span", "icon");
        const body = el("span");
        const text = el("span");
        text.textContent = description;
        const note = el("span", "note");
        body.append(text, note);
        row.append(icon, body);
        list.append(row);
        log.scrollTop = log.scrollHeight;
        const handle: StepRow = {
          setStatus(status, noteText) {
            row.dataset.status = status;
            icon.textContent = STEP_ICONS[status];
            icon.setAttribute("aria-label", status);
            note.textContent = noteText ?? "";
            log.scrollTop = log.scrollHeight;
          },
        };
        handle.setStatus("pending");
        return handle;
      },
    };
  };

  const confirm = (question: string) => {
    let answerFn: (value: boolean) => void = () => {};
    const result = new Promise<boolean>((resolve) => {
      const card = el("div", "confirm");
      card.setAttribute("role", "group");
      const text = el("div");
      text.textContent = question;
      const actions = el("div", "actions");
      const allow = el("button", "allow");
      allow.type = "button";
      allow.textContent = t("allow");
      const deny = el("button");
      deny.type = "button";
      deny.textContent = t("deny");
      actions.append(allow, deny);
      card.append(text, actions);
      log.append(card);
      log.scrollTop = log.scrollHeight;
      setOpen(true);
      allow.focus({ preventScroll: true });
      let settled = false;
      const answer = (value: boolean) => {
        if (settled) return;
        settled = true;
        card.classList.add("answered");
        allow.disabled = deny.disabled = true;
        text.textContent = `${question} ${value ? t("allowed") : t("declined")}`;
        resolve(value);
      };
      allow.addEventListener("click", () => answer(true), { once: true });
      deny.addEventListener("click", () => answer(false), { once: true });
      answerFn = answer;
    });
    return { result, answer: (value: boolean) => answerFn(value) };
  };

  let feedbackRow: HTMLElement | null = null;
  const showFeedback = (onRate: (rating: 1 | -1) => void) => {
    feedbackRow?.remove();
    const row = el("div", "feedback");
    const label = el("span");
    label.textContent = t("helpful");
    const up = el("button");
    up.type = "button";
    up.textContent = "👍";
    up.setAttribute("aria-label", t("helpfulYes"));
    const down = el("button");
    down.type = "button";
    down.textContent = "👎";
    down.setAttribute("aria-label", t("helpfulNo"));
    const rate = (rating: 1 | -1) => {
      onRate(rating);
      row.replaceChildren(rating === 1 ? t("thanks") : t("thanksDown"));
    };
    up.addEventListener("click", () => rate(1), { once: true });
    down.addEventListener("click", () => rate(-1), { once: true });
    row.append(label, up, down);
    log.append(row);
    log.scrollTop = log.scrollHeight;
    feedbackRow = row;
  };

  let chips: HTMLElement | null = null;
  const setSuggestions: Widget["setSuggestions"] = (items, onPick) => {
    chips?.remove();
    chips = null;
    if (!items.length) return;
    const list = el("div", "chips");
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", t("suggestions"));
    for (const item of items) {
      const chip = el("button");
      chip.type = "button";
      chip.textContent = item.label;
      chip.addEventListener("click", () => onPick(item.ask));
      list.append(chip);
    }
    greeting.after(list);
    chips = list;
  };

  const setChecklist: Widget["setChecklist"] = (checklist, handlers) => {
    checklistEl.replaceChildren();
    const remaining = checklist ? checklist.steps.filter((s) => !s.done).length : 0;
    badge.hidden = !checklist || remaining === 0;
    if (!checklist) {
      checklistEl.hidden = true;
      return;
    }
    checklistEl.hidden = false;
    const top = el("div", "top");
    const title = el("p", "title");
    const doneCount = checklist.steps.length - remaining;
    title.textContent = remaining
      ? t("progress", { title: checklist.title, done: doneCount, total: checklist.steps.length })
      : t("allDone", { title: checklist.title });
    const hide = el("button", "hide");
    hide.type = "button";
    hide.textContent = t("hide");
    hide.addEventListener("click", () => handlers?.onHide());
    top.append(title, hide);
    const list = el("ul");
    for (const step of checklist.steps) {
      const item = el("li", step.done ? "done" : "");
      const mark = el("span", "mark");
      mark.textContent = step.done ? "✓" : "";
      mark.setAttribute("aria-label", step.done ? "Done" : "Not done");
      const label = el("span", "label");
      label.textContent = step.title;
      item.append(mark, label);
      if (!step.done) {
        const show = el("button");
        show.type = "button";
        show.textContent = t("showMe");
        show.setAttribute("aria-label", t("showMeAria", { step: step.title }));
        show.addEventListener("click", () => handlers?.onShowMe(step.id));
        item.append(show);
      }
      list.append(item);
    }
    checklistEl.append(top, list);
  };

  return {
    host,
    pointer,
    setChecklist,
    setSuggestions,
    showNudge(text, accept, dismiss) {
      if (isOpen) return;
      nudgeText.textContent = text;
      nudgeHandlers = { accept, dismiss };
      nudge.hidden = false;
    },
    setHandoff(label, onClick) {
      handoffBtn.hidden = !label;
      handoffBtn.textContent = label ?? "";
      onHandoff = onClick;
    },
    addSteps,
    showFeedback,
    confirm,
    setRunning(handler) {
      onStop = handler;
      stopBtn.hidden = !handler;
    },
    get isOpen() {
      return isOpen;
    },
    open: () => setOpen(true),
    close: () => setOpen(false),
    addMessage,
    setStatus(status, text) {
      wrapper.dataset.status = status;
      caption.textContent =
        text ?? (status === "listening" ? t("listening") : status === "thinking" ? t("thinking") : "");
    },
    setMuted(muted) {
      muteBtn.innerHTML = muted ? ICONS.muted : ICONS.sound;
      muteBtn.setAttribute("aria-label", muted ? t("unmute") : t("mute"));
      muteBtn.setAttribute("aria-pressed", String(muted));
    },
    setVoiceAvailable(available) {
      mic.hidden = !available;
      muteBtn.hidden = !available;
      hint.textContent = available ? t("hint", { hotkey: HOTKEY_LABEL }) : "";
    },
    destroy() {
      pointer.hide();
      document.removeEventListener("keydown", onKey);
      host.remove();
    },
  };
}
