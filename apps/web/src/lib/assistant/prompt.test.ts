import { describe, expect, it } from "vitest";
import { buildSystemPrompt, describePage } from "./prompt";

describe("buildSystemPrompt", () => {
  it("includes the team's workflows and handoff option when set", () => {
    const prompt = buildSystemPrompt({
      assistantName: "Clicky",
      appName: "Acme",
      mode: "agent",
      customInstructions: "",
      handoffLabel: "Talk to a person",
      workflows: [{ name: "Invite a teammate", instructions: "1. Open Team" }],
    });
    expect(prompt).toContain('<procedure name="Invite a teammate">');
    expect(prompt).toContain('press "Talk to a person"');
    expect(prompt).toContain("app_action");
  });

  it("is identical for identical settings (so it can be cached)", () => {
    const ctx = { assistantName: "C", appName: "A", mode: "guide" as const, customInstructions: "x" };
    expect(buildSystemPrompt(ctx)).toBe(buildSystemPrompt({ ...ctx }));
  });
});

describe("describePage", () => {
  it("lists app actions with their parameters", () => {
    const text = describePage({
      url: "/reports",
      title: "Reports",
      snapshot: "",
      appActions: [
        {
          name: "exportReports",
          description: "Export all reports",
          parameters: { properties: { format: { type: "string", enum: ["csv", "pdf"] } }, required: ["format"] },
        },
      ],
    });
    expect(text).toContain('- exportReports(format: string one of "csv"|"pdf"): Export all reports');
  });
});
