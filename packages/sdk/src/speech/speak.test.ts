import { describe, expect, it } from "vitest";
import { SentenceSplitter } from "./speak";

describe("SentenceSplitter", () => {
  it("emits complete sentences as text streams in", () => {
    const s = new SentenceSplitter();
    expect(s.push("Open the Rep")).toEqual([]);
    expect(s.push("orts page. Then click ")).toEqual(["Open the Reports page."]);
    expect(s.push("Export! Done")).toEqual(["Then click Export!"]);
    expect(s.push(" now")).toEqual([]);
    expect(s.end()).toEqual(["Done now"]);
  });

  it("does not split decimals or version numbers", () => {
    const s = new SentenceSplitter();
    expect(s.push("Conversion is 2.7% this week. ")).toEqual(["Conversion is 2.7% this week."]);
  });
});
