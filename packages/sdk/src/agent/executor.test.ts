// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RISKY_ACTION_RE, type AgentAction } from "@clicky/shared/client";
import { executeAction, needsConfirmation } from "./executor";
import type { Pointer } from "../pointer";

const pointer = { pointAt: vi.fn(), hide: vi.fn() } as unknown as Pointer;
const config = {
  masking: { maskPII: true, selectors: [] },
  behavior: { mode: "agent" as const, voiceEnabled: true, blockedPaths: ["/billing"], confirmKeywords: ["archive"], trackSignals: true },
};

function ctx(refs: Record<string, Element>) {
  return { refs: new Map(Object.entries(refs)), pointer, config, signal: new AbortController().signal };
}

function action(name: AgentAction["name"], input: Partial<AgentAction["input"]>, needs = false): AgentAction {
  return { id: `t_${name}`, name, input: { description: `Do ${name}`, ...input }, needsConfirmation: needs };
}

describe("executeAction", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="go">Export</button>
      <input id="name" value="old">
      <input id="pw" type="password">
      <select id="fmt"><option value="csv">CSV</option><option value="xlsx">Excel</option></select>
      <button id="off" disabled>Off</button>
      <button id="arch">Archive project</button>`;
    history.replaceState(null, "", "/reports");
  });

  it("clicks", async () => {
    const button = document.getElementById("go")!;
    const onClick = vi.fn();
    button.addEventListener("click", onClick);
    const r = await executeAction(action("click", { ref: "e1" }), ctx({ e1: button }));
    expect(r.status).toBe("done");
    expect(onClick).toHaveBeenCalledOnce();
    expect(pointer.pointAt).toHaveBeenCalledWith(button, 2500);
  });

  it("types with input and change events", async () => {
    const input = document.getElementById("name") as HTMLInputElement;
    const events: string[] = [];
    input.addEventListener("input", () => events.push("input"));
    input.addEventListener("change", () => events.push("change"));
    const r = await executeAction(action("type", { ref: "e1", text: "Q3 report" }), ctx({ e1: input }));
    expect(r.status).toBe("done");
    expect(input.value).toBe("Q3 report");
    expect(events).toEqual(["input", "change"]);
  });

  it("never types into password fields", async () => {
    const r = await executeAction(action("type", { ref: "e1", text: "x" }), ctx({ e1: document.getElementById("pw")! }));
    expect(r.status).toBe("blocked");
  });

  it("selects by visible text and reports bad options", async () => {
    const select = document.getElementById("fmt") as HTMLSelectElement;
    expect((await executeAction(action("select", { ref: "e1", option: "excel" }), ctx({ e1: select }))).status).toBe("done");
    expect(select.value).toBe("xlsx");
    const bad = await executeAction(action("select", { ref: "e1", option: "PDF" }), ctx({ e1: select }));
    expect(bad.status).toBe("failed");
    expect(bad.output).toContain("CSV, Excel");
  });

  it("fails clearly on missing or disabled elements", async () => {
    expect((await executeAction(action("click", { ref: "e9" }), ctx({}))).output).toContain("no longer on the page");
    const disabled = await executeAction(action("click", { ref: "e1" }), ctx({ e1: document.getElementById("off")! }));
    expect(disabled.status).toBe("failed");
  });

  it("refuses to act on blocked pages", async () => {
    history.replaceState(null, "", "/billing");
    const r = await executeAction(action("click", { ref: "e1" }), ctx({ e1: document.getElementById("go")! }));
    expect(r.status).toBe("blocked");
  });

  it("skips when already stopped", async () => {
    const controller = new AbortController();
    controller.abort();
    const r = await executeAction(action("click", { ref: "e1" }), { ...ctx({ e1: document.getElementById("go")! }), signal: controller.signal });
    expect(r.status).toBe("skipped");
  });
});

describe("needsConfirmation", () => {
  beforeEach(() => {
    document.body.innerHTML = `<button id="del">Delete</button><button id="arch">Archive project</button><button id="ok">Export</button>`;
  });
  const refs = () => ({ e1: document.getElementById("del")!, e2: document.getElementById("arch")!, e3: document.getElementById("ok")! });

  it("asks for risky wording on the element, admin keywords, or when the model asked", () => {
    expect(needsConfirmation(action("click", { ref: "e1", description: "Remove row" }), ctx(refs()), RISKY_ACTION_RE)).toBe(true);
    expect(needsConfirmation(action("click", { ref: "e2", description: "Click it" }), ctx(refs()), RISKY_ACTION_RE)).toBe(true);
    expect(needsConfirmation(action("click", { ref: "e3", description: "Click Export" }, true), ctx(refs()), RISKY_ACTION_RE)).toBe(true);
    expect(needsConfirmation(action("click", { ref: "e3", description: "Click Export" }), ctx(refs()), RISKY_ACTION_RE)).toBe(false);
    expect(needsConfirmation(action("wait_for_user", { ref: "e1" }, true), ctx(refs()), RISKY_ACTION_RE)).toBe(false);
  });
});

describe("app actions", () => {
  it("validates arguments, calls the handler and reports its result", async () => {
    const { AppActionRegistry } = await import("./app-actions");
    const registry = new AppActionRegistry();
    const handler = vi.fn(async ({ format }: Record<string, unknown>) => ({ exported: 3, format }));
    registry.register("exportReports", { description: "Export all reports", parameters: { properties: { format: { type: "string", enum: ["csv", "pdf"] } }, required: ["format"] } }, handler);
    const run = (args: Record<string, unknown>) =>
      executeAction(action("app_action", { actionName: "exportReports", args, description: "Export reports" }), { ...ctx({}), appActions: registry });

    expect((await run({})).output).toContain('Missing "format"');
    expect((await run({ format: "xlsx" })).output).toContain("must be one of");
    const ok = await run({ format: "pdf" });
    expect(ok.status).toBe("done");
    expect(ok.output).toContain('{"exported":3,"format":"pdf"}');
    expect(handler).toHaveBeenCalledOnce();
    const missing = await executeAction(action("app_action", { actionName: "nope", args: {} }), { ...ctx({}), appActions: registry });
    expect(missing.status).toBe("failed");
  });

  it("asks first when the app marked the action as needing confirmation", async () => {
    const { AppActionRegistry } = await import("./app-actions");
    const registry = new AppActionRegistry();
    registry.register("archiveAll", { description: "Archive everything", confirm: true }, () => {});
    expect(needsConfirmation(action("app_action", { actionName: "archiveAll", description: "Tidy up" }), { ...ctx({}), appActions: registry }, RISKY_ACTION_RE)).toBe(true);
  });
});
