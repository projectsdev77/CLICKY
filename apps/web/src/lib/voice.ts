import "server-only";
import type { SdkInitResponse, VoiceTokenResponse } from "@clicky/shared";
import { env } from "./env";

/** Hosted speech services we can offer; anything missing falls back to the browser's built-in speech. */
export function voiceProviders(): SdkInitResponse["voice"] {
  return {
    stt: env.DEEPGRAM_API_KEY ? "deepgram" : "browser",
    tts: env.ELEVENLABS_API_KEY ? "elevenlabs" : "browser",
  };
}

/**
 * Mints a short-lived Deepgram token so the browser can stream microphone audio
 * straight to Deepgram without ever seeing our API key.
 */
export async function createDeepgramToken(): Promise<VoiceTokenResponse | null> {
  if (!env.DEEPGRAM_API_KEY) return null;
  const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: { Authorization: `Token ${env.DEEPGRAM_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl_seconds: 60 }),
  });
  if (!res.ok) throw new Error(`Deepgram grant failed: HTTP ${res.status}`);
  const { access_token, expires_in } = (await res.json()) as { access_token: string; expires_in: number };
  return { provider: "deepgram", token: access_token, expiresIn: expires_in };
}

/** Streams spoken audio (MP3) for `text` from ElevenLabs. */
export async function synthesizeSpeech(text: string, signal?: AbortSignal): Promise<Response | null> {
  if (!env.ELEVENLABS_API_KEY) return null;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(env.ELEVENLABS_VOICE_ID)}/stream?output_format=mp3_44100_64`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: env.ELEVENLABS_MODEL_ID }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`ElevenLabs TTS failed: HTTP ${res.status}`);
  return res;
}
