// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultProjectSettings } from "@clicky/shared";
import { ClickyClient } from "./client";

const settings = defaultProjectSettings();
const initResponse = {
  projectId: "p1",
  appearance: settings.appearance,
  behavior: { mode: "agent", voiceEnabled: true },
  masking: settings.masking,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("ClickyClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("calls the init endpoint and mounts the widget", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(initResponse));
    const client = new ClickyClient();
    await client.init({ projectKey: "pk_test", apiUrl: "https://api.example.com/" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.example.com/api/v1/init");
    expect(JSON.parse(String(init?.body))).toMatchObject({ projectKey: "pk_test" });
    const widget = document.querySelector("clicky-widget");
    expect(widget?.shadowRoot?.querySelector("button")?.getAttribute("aria-label")).toBe("Open Clicky");
  });

  it("only initialises once", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(initResponse));
    const client = new ClickyClient();
    await Promise.all([client.init({ projectKey: "pk_test" }), client.init({ projectKey: "pk_test" })]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(document.querySelectorAll("clicky-widget")).toHaveLength(1);
  });

  it("fails quietly when the origin is not allowed, and can retry", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: "origin_not_allowed" }, 403));
    const client = new ClickyClient();
    await expect(client.init({ projectKey: "pk_test" })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("[clicky] failed to load:", expect.stringContaining("not an allowed website"));
    expect(document.querySelector("clicky-widget")).toBeNull();
    expect(client.settings).toBeNull();
  });

  it("toggles the panel from the launcher", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(initResponse));
    const client = new ClickyClient();
    await client.init({ projectKey: "pk_test" });
    const shadow = document.querySelector("clicky-widget")!.shadowRoot!;
    const launcher = shadow.querySelector<HTMLButtonElement>(".launcher")!;
    const panel = shadow.querySelector<HTMLElement>(".panel")!;
    expect(panel.hidden).toBe(true);
    launcher.click();
    expect(panel.hidden).toBe(false);
    expect(launcher.getAttribute("aria-expanded")).toBe("true");
  });
});
