/** Small wrappers around web storage that never throw (private mode, blocked storage, etc.). */

function safeGet(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // ignore
  }
}

let memoryAnonymousId: string | null = null;

/** A random id for this browser, so conversations can be tied to one (anonymous) user. */
export function getAnonymousId(): string {
  const existing = safeGet(() => localStorage, "clicky:aid");
  if (existing) return existing;
  memoryAnonymousId ??= crypto.randomUUID();
  safeSet(() => localStorage, "clicky:aid", memoryAnonymousId);
  return memoryAnonymousId;
}

export interface StoredMessage {
  role: "user" | "assistant";
  text: string;
}

export interface SessionState {
  conversationId: string | null;
  messages: StoredMessage[];
  muted: boolean;
  open: boolean;
}

const SESSION_KEY = "clicky:session";

/** Conversation state for this tab, kept across page loads so the chat survives navigation. */
export function loadSession(): SessionState {
  try {
    const raw = safeGet(() => sessionStorage, SESSION_KEY);
    if (raw) return { conversationId: null, messages: [], muted: false, open: false, ...JSON.parse(raw) };
  } catch {
    // corrupted; start fresh
  }
  return { conversationId: null, messages: [], muted: false, open: false };
}

export function saveSession(state: SessionState) {
  safeSet(() => sessionStorage, SESSION_KEY, JSON.stringify({ ...state, messages: state.messages.slice(-30) }));
}
