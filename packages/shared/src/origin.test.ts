import { describe, expect, it } from "vitest";
import { isOriginAllowed, normalizeOrigin } from "./origin";

describe("normalizeOrigin", () => {
  it.each([
    ["app.acme.com", "https://app.acme.com"],
    ["https://app.acme.com/", "https://app.acme.com"],
    ["HTTP://LOCALHOST:5173", "http://localhost:5173"],
    ["*.acme.com", "https://*.acme.com"],
    ["http://*.acme.com:8080", "http://*.acme.com:8080"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeOrigin(input)).toBe(expected);
  });

  it.each(["", "   ", "ftp://acme.com", "https://acme.com/path", "https://acme.com?x=1"])(
    "rejects %j",
    (input) => {
      expect(normalizeOrigin(input)).toBeNull();
    },
  );
});

describe("isOriginAllowed", () => {
  const allowed = ["https://app.acme.com", "https://*.acme.dev", "http://localhost:5173"];

  it("matches exact origins", () => {
    expect(isOriginAllowed("https://app.acme.com", allowed)).toBe(true);
    expect(isOriginAllowed("http://localhost:5173", allowed)).toBe(true);
  });

  it("matches wildcard subdomains but not the bare domain", () => {
    expect(isOriginAllowed("https://staging.acme.dev", allowed)).toBe(true);
    expect(isOriginAllowed("https://a.b.acme.dev", allowed)).toBe(true);
    expect(isOriginAllowed("https://acme.dev", allowed)).toBe(false);
  });

  it("rejects lookalikes, wrong scheme, wrong port and missing origin", () => {
    expect(isOriginAllowed("https://evilacme.dev", allowed)).toBe(false);
    expect(isOriginAllowed("https://app.acme.com.evil.io", allowed)).toBe(false);
    expect(isOriginAllowed("http://app.acme.com", allowed)).toBe(false);
    expect(isOriginAllowed("http://localhost:3000", allowed)).toBe(false);
    expect(isOriginAllowed(null, allowed)).toBe(false);
    expect(isOriginAllowed("not a url", allowed)).toBe(false);
  });
});
