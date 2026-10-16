import type { SpeechToTextProvider, VoiceTokenResponse } from "@clicky/shared";

/** Push-to-talk speech recognition: start() when the key goes down, stop() when it comes up. */
export interface Listener {
  start(onPartial: (text: string) => void): Promise<void>;
  /** Stops listening and resolves with the final transcript. */
  stop(): Promise<string>;
  cancel(): void;
}

type RecognitionCtor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Uses the browser's built-in speech recognition (Chrome, Edge, Safari). */
class BrowserListener implements Listener {
  private recognition: InstanceType<RecognitionCtor> | null = null;
  private finalText = "";
  private interim = "";
  private ended: Promise<void> = Promise.resolve();

  async start(onPartial: (text: string) => void) {
    const Ctor = recognitionCtor()!;
    const recognition = new Ctor();
    this.recognition = recognition;
    this.finalText = "";
    this.interim = "";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]!;
        if (result.isFinal) this.finalText += `${result[0]!.transcript} `;
        else interim += result[0]!.transcript;
      }
      this.interim = interim;
      onPartial(`${this.finalText}${interim}`.trim());
    };
    this.ended = new Promise((resolve) => {
      recognition.onend = () => resolve();
      recognition.onerror = () => resolve();
    });
    recognition.start();
  }

  async stop() {
    this.recognition?.stop();
    await Promise.race([this.ended, new Promise((r) => setTimeout(r, 1500))]);
    this.recognition = null;
    return `${this.finalText}${this.interim}`.trim();
  }

  cancel() {
    this.recognition?.abort();
    this.recognition = null;
  }
}

/** Streams microphone audio to Deepgram over a WebSocket using a short-lived token from our API. */
class DeepgramListener implements Listener {
  private socket: WebSocket | null = null;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private finals: string[] = [];
  private interim = "";

  constructor(private getToken: () => Promise<VoiceTokenResponse>) {}

  async start(onPartial: (text: string) => void) {
    this.finals = [];
    this.interim = "";
    const [stream, { token }] = await Promise.all([
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }),
      this.getToken(),
    ]);
    this.stream = stream;
    const params = new URLSearchParams({
      model: "nova-3",
      smart_format: "true",
      interim_results: "true",
      language: (navigator.language || "en").split("-")[0]!,
    });
    const socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, ["bearer", token]);
    this.socket = socket;
    socket.onmessage = (event) => {
      const data = JSON.parse(String(event.data)) as {
        type?: string;
        is_final?: boolean;
        channel?: { alternatives?: { transcript?: string }[] };
      };
      if (data.type !== "Results") return;
      const transcript = data.channel?.alternatives?.[0]?.transcript ?? "";
      if (data.is_final) {
        if (transcript) this.finals.push(transcript);
        this.interim = "";
      } else {
        this.interim = transcript;
      }
      onPartial([...this.finals, this.interim].join(" ").trim());
    };

    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    this.recorder = recorder;
    const pending: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (!e.data.size) return;
      if (socket.readyState === WebSocket.OPEN) socket.send(e.data);
      else pending.push(e.data);
    };
    socket.onopen = () => pending.splice(0).forEach((b) => socket.send(b));
    recorder.start(250);
  }

  async stop() {
    const socket = this.socket;
    if (this.recorder && this.recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        this.recorder!.onstop = () => resolve();
        this.recorder!.stop();
      });
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    if (socket) {
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        socket.addEventListener("close", done);
        setTimeout(done, 2000);
        const close = () => socket.send(JSON.stringify({ type: "CloseStream" }));
        if (socket.readyState === WebSocket.OPEN) close();
        else socket.addEventListener("open", close);
      });
    }
    this.socket = null;
    return [...this.finals, this.interim].join(" ").trim();
  }

  cancel() {
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.socket?.close();
    this.socket = null;
  }
}

/** Picks the best available listener, or null if this browser can't do speech input. */
export function createListener(
  provider: SpeechToTextProvider,
  getToken: () => Promise<VoiceTokenResponse>,
): Listener | null {
  const canRecord = typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  if (provider === "deepgram" && canRecord) return new DeepgramListener(getToken);
  if (recognitionCtor()) return new BrowserListener();
  return null;
}
