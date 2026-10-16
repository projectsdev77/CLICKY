/**
 * The on-screen pointer: an animated cursor that flies to an element, plus a
 * highlight ring around it. Lives in the widget's shadow root, positioned with
 * `position: fixed`, and follows the element while the page scrolls.
 */

export const POINTER_STYLES = /* css */ `
  .ptr-layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483001; }
  .ptr-ring {
    position: fixed; border-radius: 10px; opacity: 0;
    box-shadow: 0 0 0 3px var(--brand), 0 0 0 9px color-mix(in srgb, var(--brand) 25%, transparent);
    transition: opacity .2s ease, top .25s ease, left .25s ease, width .25s ease, height .25s ease;
  }
  .ptr-ring.on { opacity: 1; animation: ptr-pulse 1.6s ease-in-out infinite; }
  .ptr-cursor {
    position: fixed; width: 34px; height: 34px; opacity: 0; color: var(--brand);
    filter: drop-shadow(0 3px 6px rgba(0,0,0,.3));
    transition: opacity .2s ease, transform .7s cubic-bezier(.2,.8,.2,1);
  }
  .ptr-cursor.on { opacity: 1; }
  @keyframes ptr-pulse { 50% { box-shadow: 0 0 0 3px var(--brand), 0 0 0 14px color-mix(in srgb, var(--brand) 12%, transparent); } }
  @media (prefers-reduced-motion: reduce) {
    .ptr-cursor, .ptr-ring { transition: none; }
    .ptr-ring.on { animation: none; }
  }
`;

const CURSOR_SVG = `<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true"><path fill="currentColor" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" d="M4 3l7.5 18 2.6-7.4L21.5 11z"/></svg>`;

export class Pointer {
  private ring: HTMLDivElement;
  private cursor: HTMLDivElement;
  private target: Element | null = null;
  private frame = 0;
  private hideTimer = 0;

  constructor(
    layer: HTMLElement,
    private origin: () => DOMRect,
  ) {
    this.ring = document.createElement("div");
    this.ring.className = "ptr-ring";
    this.cursor = document.createElement("div");
    this.cursor.className = "ptr-cursor";
    this.cursor.innerHTML = CURSOR_SVG;
    layer.append(this.ring, this.cursor);
    const start = this.origin();
    this.cursor.style.transform = `translate(${start.left}px, ${start.top}px)`;
  }

  /** Points at `el`, scrolling it into view if needed. Stays until replaced, hidden, or after `durationMs`. */
  pointAt(el: Element, durationMs = 9000) {
    this.target = el;
    const rect = el.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > innerHeight || rect.left < 0 || rect.right > innerWidth) {
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    }
    this.ring.classList.add("on");
    this.cursor.classList.add("on");
    cancelAnimationFrame(this.frame);
    const follow = () => {
      this.place();
      this.frame = requestAnimationFrame(follow);
    };
    follow();
    clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hide(), durationMs);
  }

  hide() {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.hideTimer);
    this.target = null;
    this.ring.classList.remove("on");
    this.cursor.classList.remove("on");
  }

  get current() {
    return this.target;
  }

  private place() {
    if (!this.target?.isConnected) return this.hide();
    const r = this.target.getBoundingClientRect();
    const pad = 4;
    Object.assign(this.ring.style, {
      top: `${r.top - pad}px`,
      left: `${r.left - pad}px`,
      width: `${r.width + pad * 2}px`,
      height: `${r.height + pad * 2}px`,
    });
    // Cursor tip lands just inside the element's lower-right area.
    const x = r.left + Math.min(r.width * 0.65, r.width - 6);
    const y = r.top + Math.min(r.height * 0.6, r.height - 4);
    this.cursor.style.transform = `translate(${x - 4}px, ${y - 3}px)`;
  }
}
