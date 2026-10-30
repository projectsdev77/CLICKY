import { describe, expect, it } from "vitest";
import { extractFileText, markdownToText } from "./files";

/** Builds a minimal, valid one-page PDF containing `text`. */
function tinyPdf(text: string): Uint8Array {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

describe("extractFileText", () => {
  it("reads text from a PDF", async () => {
    expect(await extractFileText("guide.pdf", tinyPdf("Refunds take five business days to arrive"))).toContain(
      "Refunds take five business days",
    );
  });

  it("reads Markdown, text and HTML", async () => {
    expect(await extractFileText("a.md", new TextEncoder().encode("# Billing\n\nSee [the page](https://x) for **plans**."))).toBe(
      "Billing\n\nSee the page for plans.",
    );
    expect(await extractFileText("a.txt", new TextEncoder().encode("Plain text that is long enough."))).toBe("Plain text that is long enough.");
    expect(await extractFileText("a.html", new TextEncoder().encode("<main><h1>Hi</h1><p>Some help text for users.</p></main>"))).toContain(
      "Some help text for users.",
    );
  });

  it("rejects unsupported, empty and broken files with a readable message", async () => {
    await expect(extractFileText("a.docx", new Uint8Array(10))).rejects.toThrow("only PDF, Markdown");
    await expect(extractFileText("a.txt", new TextEncoder().encode("hi"))).rejects.toThrow("no readable text");
    await expect(extractFileText("a.pdf", new TextEncoder().encode("not a pdf"))).rejects.toThrow("couldn't be read");
  });

  it("strips Markdown syntax", () => {
    expect(markdownToText("- one\n- **two**\n\n```js\ncode()\n```")).toBe("• one\n• two\n\ncode()");
  });
});
