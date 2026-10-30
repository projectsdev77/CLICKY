import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import { extractPage } from "./extract";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 500_000;
export const ACCEPTED_EXTENSIONS = [".pdf", ".md", ".markdown", ".txt", ".html", ".htm"];

/** Plain text from Markdown: keeps headings and lists as lines, drops link URLs, images and code fences. */
export function markdownToText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*/g, ""))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extracts readable text from an uploaded file, or throws a message fit to show the user. */
export async function extractFileText(name: string, bytes: Uint8Array): Promise<string> {
  const ext = name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  if (!ACCEPTED_EXTENSIONS.includes(ext)) throw new Error(`${name}: only PDF, Markdown, text and HTML files are supported.`);
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error(`${name} is larger than 10 MB.`);
  let text: string;
  if (ext === ".pdf") {
    try {
      const pdf = await getDocumentProxy(bytes);
      ({ text } = await extractText(pdf, { mergePages: true }));
    } catch {
      throw new Error(`${name} couldn't be read as a PDF.`);
    }
  } else {
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    text = ext === ".md" || ext === ".markdown" ? markdownToText(raw) : ext === ".txt" ? raw : extractPage(raw, "https://upload.local/").text;
  }
  text = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (text.length < 20) throw new Error(`${name} has no readable text (scanned PDFs need OCR first).`);
  return text.slice(0, MAX_TEXT_CHARS);
}
