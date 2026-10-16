import { MarkerParser, stripMarkers } from "@clicky/shared/client";
import type { SdkInitResponse, VoiceTokenResponse } from "@clicky/shared";
import { ApiError, postEventStream, postJson } from "./api";
import { takeSnapshot, type PageSnapshot } from "./snapshot";
import { createListener, type Listener } from "./speech/listen";
import { createSpeaker, SentenceSplitter, type Speaker } from "./speech/speak";
import { getAnonymousId, loadSession, saveSession, type SessionState } from "./storage";
import { mountWidget, type Widget } from "./widget";

export interface Caller {
  projectKey: string;
  anonymousId: string;
  user: { userId: string; traits?: Record<string, string | number | boolean | null> } | null;
}

const ERROR_TEXT: Record<string, string> = {
  rate_limited: "You're asking faster than I can keep up. Give me a moment and try again.",
  origin_not_allowed: "I'm not set up for this website yet.",
};

/**
 * Runs the assistant inside the page: takes questions (typed, or spoken via
 * push-to-talk), sends them with a snapshot of the page, streams the reply
 * into the panel, points at elements the reply mentions, and reads the reply
 * aloud when the question was spoken.
 */
export class Assistant {
  readonly widget: Widget;
  private session: SessionState;
  private listener: Listener | null;
  private speaker: Speaker | null;
  private listening: Promise<void> | null = null;
  private inflight: AbortController | null = null;
  private snapshot: PageSnapshot | null = null;
  private teardown: (() => void)[] = [];

  constructor(
    private config: SdkInitResponse,
    private apiUrl: string,
    private caller: () => Caller,
  ) {
    this.session = loadSession();
    const voice = config.behavior.voiceEnabled;
    this.listener = voice ? createListener(config.voice.stt, () => this.voiceToken()) : null;
    this.speaker = voice ? createSpeaker(config.voice.tts, (text, signal) => this.speechAudio(text, signal)) : null;

    this.widget = mountWidget(config, {
      onSubmit: (text) => void this.ask(text, "text"),
      onMicDown: () => void this.startListening(),
      onMicUp: () => void this.stopListening(),
      onMuteToggle: () => this.setMuted(!this.session.muted),
      onOpenChange: (open) => {
        this.session.open = open;
        this.save();
        if (!open) this.stopSpeaking();
      },
    });
    this.widget.setVoiceAvailable(!!this.listener);
    this.widget.setMuted(this.session.muted);
    for (const m of this.session.messages) this.widget.addMessage(m.role, m.text);
    if (this.session.open) this.widget.open();
    this.bindHotkey();
  }

  destroy() {
    this.inflight?.abort();
    this.listener?.cancel();
    this.speaker?.stop();
    this.teardown.forEach((fn) => fn());
    this.widget.destroy();
  }

  /** Asks a question about the current page. */
  async ask(question: string, inputMode: "voice" | "text") {
    this.inflight?.abort();
    this.stopSpeaking();
    const controller = new AbortController();
    this.inflight = controller;

    this.widget.open();
    this.widget.addMessage("user", question);
    this.remember("user", question);
    const bubble = this.widget.addMessage("assistant");
    this.widget.setStatus("thinking");

    this.snapshot = takeSnapshot(this.config.masking);
    const speak = inputMode === "voice" && !this.session.muted ? this.speaker : null;
    const parser = new MarkerParser();
    const splitter = new SentenceSplitter();
    const pendingPoints: string[] = [];
    let spoke = false;

    const handleParts = (parts: ReturnType<MarkerParser["push"]>) => {
      for (const part of parts) {
        if (part.type === "point") {
          // When speaking, point as the sentence that mentions it starts playing; otherwise point right away.
          if (speak) pendingPoints.push(part.ref);
          else this.pointAt(part.ref);
          continue;
        }
        bubble.append(part.text);
        if (speak) for (const sentence of splitter.push(part.text)) enqueue(sentence);
      }
    };
    const enqueue = (sentence: string) => {
      const refs = pendingPoints.splice(0);
      spoke = true;
      speak!.enqueue(sentence, () => {
        this.widget.setStatus("speaking", "");
        refs.forEach((ref) => this.pointAt(ref));
      });
    };

    try {
      const body = {
        ...this.caller(),
        conversationId: this.session.conversationId,
        message: question,
        inputMode,
        page: { url: location.href, title: document.title.slice(0, 300), snapshot: this.snapshot.text },
      };
      for await (const event of postEventStream(`${this.apiUrl}/api/v1/chat`, body, controller.signal)) {
        if (event.type === "meta") {
          this.session.conversationId = event.conversationId;
        } else if (event.type === "text") {
          // Still working until the reply finishes; the caption gives way to the streaming text.
          if (!spoke) this.widget.setStatus("thinking", "");
          handleParts(parser.push(event.delta));
        } else if (event.type === "error") {
          bubble.setText(event.message);
        }
      }
      handleParts(parser.end());
      if (speak) {
        for (const sentence of splitter.end()) enqueue(sentence);
        pendingPoints.splice(0).forEach((ref) => this.pointAt(ref));
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const code = error instanceof ApiError ? error.code : "";
      bubble.setText(ERROR_TEXT[code] ?? "I couldn't reach the server. Check your connection and try again.");
    } finally {
      if (this.inflight === controller) this.inflight = null;
    }

    const answer = stripMarkers(bubble.text).trim();
    if (answer) this.remember("assistant", answer);
    if (speak && spoke) {
      this.widget.setStatus("speaking", "");
      await speak.drain();
    }
    if (!this.inflight && !this.listening) this.widget.setStatus("idle");
  }

  private pointAt(ref: string) {
    const target = this.snapshot?.refs.get(ref);
    if (target?.isConnected) this.widget.pointer.pointAt(target);
  }

  private async startListening() {
    if (this.listening) return;
    this.inflight?.abort();
    this.stopSpeaking();
    this.widget.open();
    if (!this.listener) {
      this.widget.setStatus("idle", "Voice isn't available in this browser. Type your question instead.");
      return;
    }
    this.widget.setStatus("listening");
    const listener = this.listener;
    this.listening = listener
      .start((partial) => this.widget.setStatus("listening", partial || "Listening…"))
      .catch((error: unknown) => {
        const denied = error instanceof DOMException && error.name === "NotAllowedError";
        this.widget.setStatus(
          "idle",
          denied ? "Microphone access is blocked. Allow it in your browser to talk to me." : "I couldn't start listening.",
        );
        this.listening = null;
        throw error;
      });
  }

  private async stopListening() {
    const started = this.listening;
    if (!started || !this.listener) return;
    try {
      await started;
    } catch {
      return;
    }
    const text = await this.listener.stop();
    this.listening = null;
    if (text) void this.ask(text, "voice");
    else this.widget.setStatus("idle", "I didn't catch that. Hold the key while you talk.");
  }

  private stopSpeaking() {
    this.speaker?.stop();
    this.widget.pointer.hide();
  }

  private setMuted(muted: boolean) {
    this.session.muted = muted;
    this.widget.setMuted(muted);
    if (muted) this.speaker?.stop();
    this.save();
  }

  /** Hold Alt+Space (⌥ Space on Mac) anywhere on the page to talk. */
  private bindHotkey() {
    if (!this.listener) return;
    let held = false;
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      if (e.repeat || held) return;
      held = true;
      void this.startListening();
    };
    const up = (e: KeyboardEvent) => {
      if (!held || (e.code !== "Space" && e.key !== "Alt")) return;
      held = false;
      void this.stopListening();
    };
    const blur = () => {
      if (!held) return;
      held = false;
      void this.stopListening();
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);
    this.teardown.push(() => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur);
    });
  }

  private remember(role: "user" | "assistant", text: string) {
    this.session.messages.push({ role, text });
    this.save();
  }

  private save() {
    saveSession(this.session);
  }

  private voiceToken() {
    return postJson<VoiceTokenResponse>(`${this.apiUrl}/api/v1/voice/token`, this.caller());
  }

  private async speechAudio(text: string, signal: AbortSignal) {
    const res = await fetch(`${this.apiUrl}/api/v1/voice/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...this.caller(), text }),
      signal,
    });
    if (!res.ok) throw new ApiError(`http_${res.status}`, res.status);
    return res.blob();
  }
}

export { getAnonymousId };
