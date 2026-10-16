import { parse } from "node-html-parser";

/** Turns an HTML page into readable text plus same-site links. Pure, so it's easy to test. */
export function extractPage(html: string, pageUrl: string): { title: string; text: string; links: string[] } {
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false, pre: true } });
  const title = (root.querySelector("title")?.text ?? root.querySelector("h1")?.text ?? "").trim().slice(0, 200);

  const links: string[] = [];
  for (const a of root.querySelectorAll("a[href]")) {
    try {
      const url = new URL(a.getAttribute("href")!, pageUrl);
      url.hash = "";
      links.push(url.toString());
    } catch {}
  }

  root.querySelectorAll("script, style, noscript, svg, nav, header, footer, aside, form, iframe").forEach((el) => el.remove());
  const main = root.querySelector("main, article, [role=main]") ?? root.querySelector("body") ?? root;
  const text = main.structuredText
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return { title, text, links };
}

/** Splits text into ~`size`-character chunks on paragraph boundaries. */
export function chunkText(text: string, size = 1200): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of text.split(/\n+/)) {
    if (current && current.length + paragraph.length + 1 > size) {
      chunks.push(current);
      current = "";
    }
    if (paragraph.length > size) {
      for (let i = 0; i < paragraph.length; i += size) chunks.push(paragraph.slice(i, i + size));
      continue;
    }
    current = current ? `${current}\n${paragraph}` : paragraph;
  }
  if (current) chunks.push(current);
  return chunks;
}
