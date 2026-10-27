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
  /** Shows a Stop button while an agent run is in progress (null hides it). */
  setRunning(onStop: (() => void) | null): void;
  destroy(): void;
}

const STYLES = /* css */ `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .light { --bg: #fff; --fg: #18181b; --muted: #71717a; --border: #e4e4e7; --soft: #f4f4f5; }
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
  .msg.user { align-self: flex-end; background: var(--brand); color: #fff; border-bottom-right-radius: 4px; }
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
  .send { background: var(--brand); color: #fff; }
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
  .confirm button.allow { background: var(--brand); border-color: var(--brand); color: #fff; }
  .confirm.answered { opacity: .7; }
  .feedback { align-self: flex-start; display: flex; gap: 4px; align-items: center; color: var(--muted); font-size: 12px; margin-top: -4px; }
  .feedback button { border: 0; background: transparent; padding: 2px 6px; border-radius: 6px; font-size: 14px; color: var(--muted); }
  .feedback button:hover { background: var(--soft); }
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
  muteBtn.setAttribute("aria-label", "Mute spoken replies");
  const closeBtn = el("button", "icon-btn", ICONS.close);
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", `Close ${appearance.assistantName}`);
  const stopBtn = el("button", "stop");
  stopBtn.type = "button";
  stopBtn.textContent = "Stop";
  stopBtn.hidden = true;
  let onStop: (() => void) | null = null;
  stopBtn.addEventListener("click", () => onStop?.());
  header.append(dot, title, stopBtn, muteBtn, closeBtn);

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
  input.placeholder = "Ask anything…";
  input.setAttribute("aria-label", `Ask ${appearance.assistantName}`);
  input.maxLength = 2000;
  const mic = el("button", "mic", ICONS.mic);
  mic.type = "button";
  mic.setAttribute("aria-label", "Talk (hold to speak)");
  const send = el("button", "send", ICONS.send);
  send.type = "submit";
  send.setAttribute("aria-label", "Send");
  composer.append(input, mic, send);

  const hint = el("div", "hint");
  panel.append(header, log, caption, composer, hint);

  const launcher = el("button", "launcher", ICONS.logo);
  launcher.type = "button";
  launcher.setAttribute("aria-label", `Open ${appearance.assistantName}`);
  launcher.setAttribute("aria-expanded", "false");

  const pointerLayer = el("div", "ptr-layer");
  root.append(panel, launcher);
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
    launcher.setAttribute("aria-label", `${open ? "Close" : "Open"} ${appearance.assistantName}`);
    if (open) log.scrollTop = log.scrollHeight;
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
      allow.textContent = "Allow";
      const deny = el("button");
      deny.type = "button";
      deny.textContent = "Don't";
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
        text.textContent = `${question} ${value ? "(allowed)" : "(declined)"}`;
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
    label.textContent = "Helpful?";
    const up = el("button");
    up.type = "button";
    up.textContent = "👍";
    up.setAttribute("aria-label", "Helpful");
    const down = el("button");
    down.type = "button";
    down.textContent = "👎";
    down.setAttribute("aria-label", "Not helpful");
    const rate = (rating: 1 | -1) => {
      onRate(rating);
      row.replaceChildren(rating === 1 ? "Thanks!" : "Thanks. We'll use this to improve.");
    };
    up.addEventListener("click", () => rate(1), { once: true });
    down.addEventListener("click", () => rate(-1), { once: true });
    row.append(label, up, down);
    log.append(row);
    log.scrollTop = log.scrollHeight;
    feedbackRow = row;
  };

  return {
    host,
    pointer,
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
        text ?? (status === "listening" ? "Listening…" : status === "thinking" ? "Thinking…" : "");
    },
    setMuted(muted) {
      muteBtn.innerHTML = muted ? ICONS.muted : ICONS.sound;
      muteBtn.setAttribute("aria-label", muted ? "Unmute spoken replies" : "Mute spoken replies");
      muteBtn.setAttribute("aria-pressed", String(muted));
    },
    setVoiceAvailable(available) {
      mic.hidden = !available;
      muteBtn.hidden = !available;
      hint.textContent = available ? `Hold ${HOTKEY_LABEL} anywhere to talk.` : "";
    },
    destroy() {
      pointer.hide();
      document.removeEventListener("keydown", onKey);
      host.remove();
    },
  };
}
