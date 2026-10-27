import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes commas, quotes and newlines, and neutralises formulas", () => {
    expect(toCsv(["a", "b"], [["x,y", 'say "hi"'], ["line\nbreak", "=SUM(A1)"], [null, 3]])).toBe(
      'a,b\r\n"x,y","say ""hi"""\r\n"line\nbreak",\'=SUM(A1)\r\n,3\r\n',
    );
  });
});
