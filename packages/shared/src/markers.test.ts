import { describe, expect, it } from "vitest";
import { MarkerParser, stripMarkers, type ReplyPart } from "./markers";

function feed(chunks: string[]): ReplyPart[] {
  const parser = new MarkerParser();
  const parts = chunks.flatMap((c) => parser.push(c)).concat(parser.end());
  // merge adjacent text for easy assertions
  return parts.reduce<ReplyPart[]>((acc, p) => {
    const prev = acc[acc.length - 1];
    if (p.type === "text" && prev?.type === "text") prev.text += p.text;
    else acc.push({ ...p });
    return acc;
  }, []);
}

describe("MarkerParser", () => {
  it("extracts markers from a single chunk", () => {
    expect(feed(["Click {{point:e12}}Export to download."])).toEqual([
      { type: "text", text: "Click " },
      { type: "point", ref: "e12" },
      { type: "text", text: "Export to download." },
    ]);
  });

  it("handles markers split across chunks", () => {
    expect(feed(["Open ", "{", "{poi", "nt:e", "4}", "}Settings"])).toEqual([
      { type: "text", text: "Open " },
      { type: "point", ref: "e4" },
      { type: "text", text: "Settings" },
    ]);
  });

  it("does not swallow ordinary braces", () => {
    expect(feed(["Use {name} or {", "{x}} here"])).toEqual([{ type: "text", text: "Use {name} or {{x}} here" }]);
  });

  it("flushes an unfinished marker as text at the end", () => {
    expect(feed(["Almost {{poi"])).toEqual([{ type: "text", text: "Almost {{poi" }]);
  });

  it("strips markers", () => {
    expect(stripMarkers("Hit {{point:e1}} Save  now")).toBe("Hit Save now");
  });
});
