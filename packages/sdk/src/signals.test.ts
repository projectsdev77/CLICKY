// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SdkEvent } from "@clicky/shared";
import { SignalTracker } from "./signals";

describe("SignalTracker", () => {
  let sent: SdkEvent[];
  let tracker: SignalTracker;

  beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
    history.replaceState(null, "", "/reports");
    document.body.innerHTML = `<button id="b">Export</button><form><input id="email" required name="email"></form><div id="host"></div>`;
    tracker = new SignalTracker((body) => sent.push(...body.events), { maskPII: true, selectors: [] });
  });
  afterEach(() => {
    tracker.destroy();
    vi.useRealTimers();
  });

  const flush = () => vi.advanceTimersByTime(10_000);

  it("records page views, including SPA navigation", () => {
    history.pushState(null, "", "/settings");
    history.pushState(null, "", "/settings"); // same path: no duplicate
    flush();
    expect(sent.filter((e) => e.type === "pageview").map((e) => e.path)).toEqual(["/reports", "/settings"]);
  });

  it("detects rage clicks once per burst", () => {
    const b = document.getElementById("b")!;
    for (let i = 0; i < 5; i++) b.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 10 }));
    flush();
    const rage = sent.filter((e) => e.type === "rage_click");
    expect(rage).toHaveLength(1);
    expect(rage[0]!.element).toBe('button "Export"');
  });

  it("detects form validation errors without sending values", () => {
    const input = document.getElementById("email") as HTMLInputElement;
    input.value = "jo@acme.test";
    input.dispatchEvent(new Event("invalid"));
    flush();
    const err = sent.find((e) => e.type === "form_error")!;
    expect(err.element).toBe('textbox "email"');
    expect(JSON.stringify(sent)).not.toContain("jo@acme.test");
  });

  it("records custom events", () => {
    tracker.track("report_created", { format: "csv" });
    flush();
    expect(sent.find((e) => e.type === "custom")?.props).toEqual({ format: "csv", name: "report_created" });
  });
});

describe("struggle detection", () => {
  it("notices rage clicks and repeated form errors, even when not sending events", () => {
    document.body.innerHTML = `<button id="b">Save</button><input id="i" required>`;
    const sent: unknown[] = [];
    const struggles: string[] = [];
    const t = new SignalTracker((b) => sent.push(b), { maskPII: true, selectors: [] }, { send: false, onStruggle: (k) => struggles.push(k) });
    const b = document.getElementById("b")!;
    for (let i = 0; i < 3; i++) b.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 5, clientY: 5 }));
    const input = document.getElementById("i")!;
    input.dispatchEvent(new Event("invalid"));
    expect(struggles).toEqual(["rage_click"]);
    input.dispatchEvent(new Event("invalid"));
    expect(struggles).toEqual(["rage_click", "form_error"]);
    t.destroy();
    expect(sent).toEqual([]);
  });
});
