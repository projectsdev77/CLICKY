/**
 * The assistant points at things by writing `{{point:e12}}` inline, where `e12`
 * is an element ref from the page snapshot. Markers are stripped before text is
 * shown or spoken; the widget points at the element when that part of the reply
 * is reached.
 */
export const POINT_MARKER_RE = /\{\{point:(e\d{1,4})\}\}/g;

export type ReplyPart = { type: "text"; text: string } | { type: "point"; ref: string };

/**
 * Incrementally splits streamed text into text and point parts. Holds back a
 * trailing fragment that could be the start of a marker until it's complete.
 */
export class MarkerParser {
  private buffer = "";

  push(chunk: string): ReplyPart[] {
    this.buffer += chunk;
    const parts: ReplyPart[] = [];
    let last = 0;
    for (const match of this.buffer.matchAll(POINT_MARKER_RE)) {
      if (match.index > last) parts.push({ type: "text", text: this.buffer.slice(last, match.index) });
      parts.push({ type: "point", ref: match[1]! });
      last = match.index + match[0].length;
    }
    let rest = this.buffer.slice(last);
    // Hold back a trailing fragment that could still become a marker.
    let held = "";
    for (let i = Math.max(0, rest.length - 16); i < rest.length; i++) {
      if (rest[i] === "{" && isMarkerPrefix(rest.slice(i))) {
        held = rest.slice(i);
        rest = rest.slice(0, i);
        break;
      }
    }
    if (rest) parts.push({ type: "text", text: rest });
    this.buffer = held;
    return parts;
  }

  /** Flushes anything held back at the end of the stream. */
  end(): ReplyPart[] {
    const rest = this.buffer;
    this.buffer = "";
    return rest ? [{ type: "text", text: rest }] : [];
  }
}

/** True if `s` could be the beginning of `{{point:e<digits>}}`. */
function isMarkerPrefix(s: string): boolean {
  const literal = "{{point:e";
  if (s.length <= literal.length) return literal.startsWith(s);
  if (!s.startsWith(literal)) return false;
  return /^\d{1,4}(\}\}?)?$/.test(s.slice(literal.length)) || s.slice(literal.length) === "";
}

export function stripMarkers(text: string): string {
  return text.replace(POINT_MARKER_RE, "").replace(/[ \t]{2,}/g, " ");
}
