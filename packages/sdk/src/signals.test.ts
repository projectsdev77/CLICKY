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
