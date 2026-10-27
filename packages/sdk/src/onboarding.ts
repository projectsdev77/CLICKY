import { matchesPathPattern } from "@clicky/shared/client";
import type { OnboardingState } from "@clicky/shared";
import { accessibleName } from "./snapshot";
import type { Widget } from "./widget";

/**
 * The onboarding checklist: shows the team's "get started" steps in the panel,
 * ticks them off when the user visits a page, clicks something, or the app
 * tracks an event, and offers "Show me" for each remaining step.
 */
export class Onboarding {
  private completed: Set<string>;
  private timer = 0;
  private lastPath = "";
  private teardown: (() => void)[] = [];

  constructor(
    private state: OnboardingState,
    private widget: Widget,
    private hooks: { complete(stepId: string): void; showMe(stepTitle: string): void; storageKey: string },
  ) {
    this.completed = new Set(state.completed);
    if (this.hidden || this.allDone()) return;
    this.render();
    this.checkPage();
    this.timer = window.setInterval(() => this.checkPage(), 700);
    const onClick = (e: Event) => this.onClick(e);
    document.addEventListener("click", onClick, true);
    this.teardown.push(() => document.removeEventListener("click", onClick, true));
  }

  /** Called from Clicky.track(). */
  onEvent(name: string) {
    for (const step of this.remaining()) {
      if (step.doneWhen.type === "event" && step.doneWhen.value === name) this.complete(step.id);
    }
  }

  destroy() {
    clearInterval(this.timer);
    this.teardown.forEach((fn) => fn());
  }

  private get hidden() {
    try {
      return localStorage.getItem(this.hooks.storageKey) === "hidden";
    } catch {
      return false;
    }
  }

  private remaining() {
    return this.state.steps.filter((s) => !this.completed.has(s.id));
  }

  private allDone() {
    return this.remaining().length === 0;
  }

  private checkPage() {
    if (location.pathname === this.lastPath) return;
    this.lastPath = location.pathname;
    for (const step of this.remaining()) {
      if (step.doneWhen.type === "page" && matchesPathPattern(step.doneWhen.value, location.pathname)) this.complete(step.id);
    }
  }

  private onClick(e: Event) {
    if (e.composedPath().some((n) => (n as Element).tagName === "CLICKY-WIDGET")) return;
    const target = (e.target as Element | null)?.closest?.("a, button, input, select, summary, label, [role=button], [role=link], [role=tab], [role=menuitem]");
    if (!target) return;
    const label = accessibleName(target).toLowerCase();
    for (const step of this.remaining()) {
      if (step.doneWhen.type === "click" && label && label.includes(step.doneWhen.value.toLowerCase())) this.complete(step.id);
    }
  }

  private complete(stepId: string) {
    if (this.completed.has(stepId)) return;
    this.completed.add(stepId);
    this.hooks.complete(stepId);
    this.render();
    if (this.allDone()) {
      this.destroy();
      setTimeout(() => this.widget.setChecklist(null), 8000);
    }
  }

  private render() {
    this.widget.setChecklist(
      { title: this.state.title, steps: this.state.steps.map((s) => ({ id: s.id, title: s.title, done: this.completed.has(s.id) })) },
      {
        onShowMe: (id) => {
          const step = this.state.steps.find((s) => s.id === id);
          if (step) this.hooks.showMe(step.title);
        },
        onHide: () => {
          try {
            localStorage.setItem(this.hooks.storageKey, "hidden");
          } catch {
            // ignore
          }
          this.destroy();
          this.widget.setChecklist(null);
        },
      },
    );
  }
}
