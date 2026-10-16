import type { SdkInitResponse } from "@clicky/shared";

export interface Widget {
  host: HTMLElement;
  open(): void;
  close(): void;
  destroy(): void;
}

const STYLES = /* css */ `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .root { position: fixed; bottom: 20px; z-index: 2147483000; display: flex; flex-direction: column; gap: 12px; }
  .root.right { right: 20px; align-items: flex-end; }
  .root.left { left: 20px; align-items: flex-start; }
  .launcher {
    width: 52px; height: 52px; border-radius: 999px; border: 0; cursor: pointer; color: #fff;
    background: var(--brand); box-shadow: 0 6px 20px rgba(0,0,0,.2);
    display: grid; place-items: center; transition: transform .15s ease;
  }
  .launcher:hover { transform: scale(1.05); }
  .launcher:focus-visible { outline: 3px solid color-mix(in srgb, var(--brand) 40%, transparent); outline-offset: 2px; }
  .panel {
    width: min(360px, calc(100vw - 40px)); border-radius: 14px; padding: 16px;
    background: var(--bg); color: var(--fg); border: 1px solid var(--border);
    box-shadow: 0 12px 40px rgba(0,0,0,.18); font-size: 14px; line-height: 1.5;
  }
  .panel[hidden] { display: none; }
  .title { font-weight: 600; margin: 0 0 4px; }
  .muted { color: var(--muted); margin: 0; }
  .light { --bg: #fff; --fg: #18181b; --muted: #71717a; --border: #e4e4e7; }
  .dark { --bg: #18181b; --fg: #fafafa; --muted: #a1a1aa; --border: #27272a; }
  @media (prefers-reduced-motion: reduce) { .launcher { transition: none; } }
`;

const ICON = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4l7.07 17 2.51-7.39L21 11.07z"/></svg>`;

function resolveTheme(theme: SdkInitResponse["appearance"]["theme"]) {
  if (theme !== "auto") return theme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Mounts the launcher and panel inside a Shadow DOM so host styles can't leak in or out. */
export function mountWidget(config: SdkInitResponse): Widget {
  const { appearance } = config;
  const host = document.createElement("clicky-widget");
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = STYLES;

  const root = document.createElement("div");
  root.className = `root ${appearance.position === "bottom-left" ? "left" : "right"} ${resolveTheme(appearance.theme)}`;
  root.style.setProperty("--brand", appearance.brandColor);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", appearance.assistantName);
  const title = document.createElement("p");
  title.className = "title";
  title.textContent = appearance.assistantName;
  const greeting = document.createElement("p");
  greeting.className = "muted";
  greeting.textContent = appearance.greeting;
  panel.append(title, greeting);

  const launcher = document.createElement("button");
  launcher.className = "launcher";
  launcher.type = "button";
  launcher.innerHTML = ICON;
  launcher.setAttribute("aria-label", `Open ${appearance.assistantName}`);
  launcher.setAttribute("aria-expanded", "false");

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
  };
  launcher.addEventListener("click", () => setOpen(panel.hidden));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !panel.hidden) setOpen(false);
  };
  document.addEventListener("keydown", onKey);

  root.append(panel, launcher);
  shadow.append(style, root);
  document.body.append(host);

  return {
    host,
    open: () => setOpen(true),
    close: () => setOpen(false),
    destroy: () => {
      document.removeEventListener("keydown", onKey);
      host.remove();
    },
  };
}
