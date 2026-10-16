import { describe, expect, it } from "vitest";
import { chunkText, extractPage } from "./extract";

describe("extractPage", () => {
  it("keeps main content and drops chrome and scripts", () => {
    const html = `<html><head><title>Exporting reports</title><script>evil()</script></head>
      <body><nav>Home Pricing</nav><main><h1>Export a report</h1><p>Open <b>Reports</b> and click Export.</p>
      <a href="/help/billing#top">Billing</a></main><footer>© Acme</footer></body></html>`;
    const page = extractPage(html, "https://help.acme.com/help/export");
    expect(page.title).toBe("Exporting reports");
    expect(page.text).toContain("Open Reports and click Export.");
    expect(page.text).not.toContain("evil");
    expect(page.text).not.toContain("Pricing");
    expect(page.text).not.toContain("Acme");
    expect(page.links).toEqual(["https://help.acme.com/help/billing"]);
  });
});

describe("chunkText", () => {
  it("groups paragraphs up to the size limit", () => {
    const chunks = chunkText(["a".repeat(500), "b".repeat(500), "c".repeat(500)].join("\n"), 1200);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe(`${"a".repeat(500)}\n${"b".repeat(500)}`);
  });

  it("splits oversized paragraphs", () => {
    expect(chunkText("x".repeat(2500), 1000)).toHaveLength(3);
  });
});
