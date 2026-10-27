import { describe, expect, it } from "vitest";
import { isPathBlocked, matchesPathPattern, RISKY_ACTION_RE } from "./agent";

describe("matchesPathPattern", () => {
  it.each([
    ["/billing", "/billing", true],
    ["/billing", "/billing/", true],
    ["/billing", "/billing/cards", false],
    ["/admin/*", "/admin/users", true],
    ["/admin/*", "/admin/users/1", false],
    ["/admin/**", "/admin/users/1", true],
    ["/admin/**", "/administrator", false],
    ["/settings/*/danger", "/settings/team/danger", true],
    ["/a.b", "/axb", false],
  ])("%s vs %s -> %s", (pattern, path, expected) => {
    expect(matchesPathPattern(pattern, path)).toBe(expected);
  });

  it("ignores blank patterns", () => {
    expect(isPathBlocked(["", "  "], "/")).toBe(false);
    expect(isPathBlocked(["/x", "/billing"], "/billing")).toBe(true);
  });
});

describe("RISKY_ACTION_RE", () => {
  it("flags destructive and payment wording", () => {
    expect(RISKY_ACTION_RE.test("Click Delete")).toBe(true);
    expect(RISKY_ACTION_RE.test("Click Update card")).toBe(true);
    expect(RISKY_ACTION_RE.test("Click Switch to Growth")).toBe(true);
    expect(RISKY_ACTION_RE.test("Click Export")).toBe(false);
    expect(RISKY_ACTION_RE.test("Select CSV in Export format")).toBe(false);
  });
});
