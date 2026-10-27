import type { SdkInitResponse } from "@clicky/shared";
import type { AppActionInfo } from "@clicky/shared";
import { Assistant, getAnonymousId, type Caller } from "./assistant";
import type { AppActionHandler } from "./agent/app-actions";
import { postQuietly } from "./api";
import { SignalTracker } from "./signals";
import { Onboarding } from "./onboarding";
import type { OnboardingState } from "@clicky/shared";

export interface InitOptions {
  /** Your project's public key (starts with `pk_`). */
  projectKey: string;
  /** Clicky API base URL. Defaults to the hosted service. */
  apiUrl?: string;
}

export interface IdentifyOptions {
  userId: string;
  traits?: Record<string, string | number | boolean | null>;
}

// TODO: replace with the production domain once it is chosen.
export const DEFAULT_API_URL = "https://app.clicky.ai";

export class ClickyClient {
  private assistant: Assistant | null = null;
  private signals: SignalTracker | null = null;
  private onboarding: Onboarding | null = null;
  private pendingActions = new Map<string, { info: Omit<AppActionInfo, "name">; handler: AppActionHandler }>();
  private config: SdkInitResponse | null = null;
  private user: IdentifyOptions | null = null;
  private projectKey = "";
  private starting: Promise<void> | null = null;

  /** Loads Clicky. Safe to call more than once; never throws into the host app. */
  init(options: InitOptions): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
    this.starting ??= this.start(options).catch((error) => {
      this.starting = null;
      console.warn("[clicky] failed to load:", error instanceof Error ? error.message : error);
    });
    return this.starting;
  }

  /** Tells Clicky who the current user is, so conversations show up under their id in your dashboard. */
  identify(options: IdentifyOptions) {
    this.user = { userId: String(options.userId), traits: options.traits };
  }

  /**
   * Lets Clicky call a function in your app directly (instead of clicking through the UI), e.g.
   * Clicky.registerAction("exportReports", { description: "Export all reports", parameters: { properties: { format: { type: "string", enum: ["csv", "pdf"] } }, required: ["format"] } }, ({ format }) => exportAll(format)).
   * Returns a function that unregisters it. Registrations made before init() are kept.
   */
  registerAction(name: string, info: Omit<AppActionInfo, "name">, handler: AppActionHandler): () => void {
    this.pendingActions.set(name, { info, handler });
    this.assistant?.appActions.register(name, info, handler);
    return () => this.unregisterAction(name);
  }

  unregisterAction(name: string) {
    this.pendingActions.delete(name);
    this.assistant?.appActions.unregister(name);
  }

  /** Records a custom event (e.g. "report_created") for your Clicky analytics. */
  track(name: string, props?: Record<string, string | number | boolean | null>) {
    this.signals?.track(name, props);
    this.onboarding?.onEvent(name);
  }

  /** Opens the assistant panel. */
  open() {
    this.assistant?.widget.open();
  }

  /** Asks Clicky a question programmatically, as if the user typed it. */
  ask(question: string) {
    return this.assistant?.ask(question, "text");
  }

  /** Removes the widget from the page. */
  destroy() {
    this.assistant?.destroy();
    this.assistant = null;
    this.signals?.destroy();
    this.signals = null;
    this.onboarding?.destroy();
    this.onboarding = null;
    this.config = null;
    this.starting = null;
  }

  get identifiedUser() {
    return this.user;
  }

  get settings() {
    return this.config;
  }

  /** Loads this user's onboarding checklist, if the team set one up and they're new. */
  private async startOnboarding(base: string, projectKey: string) {
    try {
      const res = await fetch(`${base}/api/v1/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.caller()),
      });
      const state = res.ok ? ((await res.json()) as OnboardingState | null) : null;
      if (!state || !this.assistant) return;
      const assistant = this.assistant;
      this.onboarding = new Onboarding(state, assistant.widget, {
        storageKey: `clicky:onboarding:${projectKey}`,
        complete: (stepId) => postQuietly(`${base}/api/v1/onboarding/complete`, { ...this.caller(), stepId }),
        showMe: (title) => void assistant.ask(`Show me how to ${title.charAt(0).toLowerCase()}${title.slice(1)}`, "text"),
      });
    } catch {
      // onboarding is optional; never break the host app
    }
  }

  private caller = (): Caller => ({ projectKey: this.projectKey, anonymousId: getAnonymousId(), user: this.user });

  private async start({ projectKey, apiUrl = DEFAULT_API_URL }: InitOptions) {
    const base = apiUrl.replace(/\/+$/, "");
    const res = await fetch(`${base}/api/v1/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectKey, url: window.location.href, sdkVersion: __SDK_VERSION__ }),
    });
    if (!res.ok) {
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(
        error === "origin_not_allowed"
          ? `${window.location.origin} is not an allowed website for this project`
          : (error ?? `HTTP ${res.status}`),
      );
    }
    this.projectKey = projectKey;
    const config = (await res.json()) as SdkInitResponse;
    // Defaults for settings an older server may not send yet.
    config.proactive ??= { enabled: false, stuckSeconds: 45 };
    config.handoff ??= { url: "", label: "Talk to a person" };
    this.config = config;
    if (document.readyState === "loading") {
      await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
    }
    this.assistant = new Assistant(this.config, base, this.caller);
    for (const [name, { info, handler }] of this.pendingActions) this.assistant.appActions.register(name, info, handler);
    const { trackSignals } = this.config.behavior;
    const { proactive } = this.config;
    if (trackSignals || proactive.enabled) {
      const assistant = this.assistant;
      const signals = new SignalTracker(
        (body, beacon) => postQuietly(`${base}/api/v1/events`, { ...this.caller(), ...body }, beacon),
        this.config.masking,
        {
          send: trackSignals,
          stuckMs: proactive.stuckSeconds * 1000,
          onStruggle: proactive.enabled ? (kind, element) => assistant.nudge(kind, element) : undefined,
        },
      );
      assistant.recordEvent = (type, element) => signals.record(type, element);
      this.signals = signals;
    }
    if (this.config.hasOnboarding) void this.startOnboarding(base, projectKey);
  }
}
