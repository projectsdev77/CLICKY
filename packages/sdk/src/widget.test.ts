import { describe, expect, it } from "vitest";
import { textOnColor } from "./widget";

describe("textOnColor", () => {
  it("uses white on dark brand colors and dark text on light ones", () => {
    expect(textOnColor("#6d28d9")).toBe("#ffffff");
    expect(textOnColor("#1d4ed8")).toBe("#ffffff");
    expect(textOnColor("#facc15")).toBe("#18181b");
    expect(textOnColor("#a7f3d0")).toBe("#18181b");
  });
});
