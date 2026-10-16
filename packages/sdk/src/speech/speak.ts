import type { TextToSpeechProvider } from "@clicky/shared";

/**
 * Speaks a reply sentence by sentence as it streams in. `onStart` fires when a
 * sentence starts playing, which is when the widget points at whatever that
 * sentence mentions.
 */
export interface Speaker {
  enqueue(sentence: string, onStart?: () => void): void;
  /** Resolves once everything queued has finished playing (or was stopped). */
  drain(): Promise<void>;
  stop(): void;
}

type Item = { text: string; onStart?: () => void; audio?: Promise<Blob | null> };

/** Plays MP3 audio from our /voice/speech endpoint (ElevenLabs), fetching the next sentence while one plays. */
class AudioSpeaker implements Speaker {
  private queue: Item[] = [];
  private playing = false;
  private current: HTMLAudioElement | null = null;
  private controller = new AbortController();
  private idle: (() => void)[] = [];

  constructor(private fetchAudio: (text: string, signal: AbortSignal) => Promise<Blob>) {}

  enqueue(text: string, onStart?: () => void) {
    const item: Item = { text, onStart };
    item.audio = this.fetchAudio(text, this.controller.signal).catch(() => null);
    this.queue.push(item);
    if (!this.playing) void this.playNext();
  }

  private async playNext(): Promise<void> {
    const item = this.queue.shift();
    if (!item) {
      this.playing = false;
      this.idle.splice(0).forEach((resolve) => resolve());
      return;
    }
    this.playing = true;
    const blob = await item.audio;
    if (!this.playing) return; // stopped while fetching
    item.onStart?.();
    if (!blob) return this.playNext();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    this.current = audio;
    await new Promise<void>((resolve) => {
      audio.onended = audio.onerror = audio.onpause = () => resolve();
      audio.play().catch(() => resolve());
    });
    URL.revokeObjectURL(url);
    if (this.playing) await this.playNext();
  }

  drain() {
    if (!this.playing && this.queue.length === 0) return Promise.resolve();
    return new Promise<void>((resolve) => this.idle.push(resolve));
  }

  stop() {
    this.controller.abort();
    this.controller = new AbortController();
    this.queue = [];
    this.playing = false;
    this.current?.pause();
    this.current = null;
    this.idle.splice(0).forEach((resolve) => resolve());
  }
}

/** Uses the browser's built-in speech synthesis. */
class BrowserSpeaker implements Speaker {
  private pending = 0;
  private idle: (() => void)[] = [];

  enqueue(text: string, onStart?: () => void) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = navigator.language || "en-US";
    utterance.rate = 1.05;
    this.pending++;
    utterance.onstart = () => onStart?.();
    utterance.onend = utterance.onerror = () => {
      this.pending = Math.max(0, this.pending - 1);
      if (this.pending === 0) this.idle.splice(0).forEach((resolve) => resolve());
    };
    speechSynthesis.speak(utterance);
  }

  drain() {
    if (this.pending === 0) return Promise.resolve();
    return new Promise<void>((resolve) => this.idle.push(resolve));
  }

  stop() {
    this.pending = 0;
    speechSynthesis.cancel();
    this.idle.splice(0).forEach((resolve) => resolve());
  }
}

export function createSpeaker(
  provider: TextToSpeechProvider,
  fetchAudio: (text: string, signal: AbortSignal) => Promise<Blob>,
): Speaker | null {
  if (provider === "elevenlabs" && typeof Audio !== "undefined") return new AudioSpeaker(fetchAudio);
  if (typeof speechSynthesis !== "undefined") return new BrowserSpeaker();
  return null;
}

/**
 * Splits streamed text into speakable sentences. Text is pushed in as it
 * arrives; complete sentences come out, the unfinished tail is held back.
 */
export class SentenceSplitter {
  private buffer = "";

  push(text: string): string[] {
    this.buffer += text;
    const sentences: string[] = [];
    let start = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const ch = this.buffer[i]!;
      // A sentence ends at a newline, or at . ! ? (plus closing quotes/brackets) followed by whitespace.
      let end = -1;
      if (ch === "\n") end = i;
      else if (".!?".includes(ch)) {
        let j = i + 1;
        while (j < this.buffer.length && "\"')]".includes(this.buffer[j]!)) j++;
        if (j < this.buffer.length && /\s/.test(this.buffer[j]!)) end = j - 1;
      }
      if (end === -1) continue;
      const sentence = this.buffer.slice(start, end + 1).trim();
      if (sentence) sentences.push(sentence);
      start = end + 1;
      i = end;
    }
    this.buffer = this.buffer.slice(start);
    return sentences;
  }

  end(): string[] {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest ? [rest] : [];
  }
}
