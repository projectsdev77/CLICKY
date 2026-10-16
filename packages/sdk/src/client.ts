import type { SdkInitResponse } from "@clicky/shared";
import { mountWidget, type Widget } from "./widget";

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
  private widget: Widget | null = null;
  private config: SdkInitResponse | null = null;
  private user: IdentifyOptions | null = null;
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

  identify(options: IdentifyOptions) {
    this.user = { userId: String(options.userId), traits: options.traits };
  }

  /** Removes the widget from the page. */
  destroy() {
    this.widget?.destroy();
    this.widget = null;
    this.config = null;
    this.starting = null;
  }

  get identifiedUser() {
    return this.user;
  }

  get settings() {
    return this.config;
  }

  private async start({ projectKey, apiUrl = DEFAULT_API_URL }: InitOptions) {
    const res = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/v1/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectKey, url: window.location.href, sdkVersion: __SDK_VERSION__ }),
    });
    if (!res.ok) {
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(error === "origin_not_allowed" ? `${window.location.origin} is not an allowed website for this project` : (error ?? `HTTP ${res.status}`));
    }
    this.config = (await res.json()) as SdkInitResponse;
    this.widget = mountWidget(this.config);
  }
}
