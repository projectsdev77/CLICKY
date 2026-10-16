import { z } from "zod";
import type { ProjectSettings } from "./settings";
import { MAX_QUESTION_CHARS, MAX_SNAPSHOT_CHARS } from "./limits";

export { MAX_QUESTION_CHARS, MAX_SNAPSHOT_CHARS };

/** Sent by the SDK on load. Also how the dashboard detects a working install. */
export const sdkInitRequestSchema = z.object({
  projectKey: z.string(),
  url: z.string().url(),
  sdkVersion: z.string().max(32),
});
export type SdkInitRequest = z.infer<typeof sdkInitRequestSchema>;

export type SpeechToTextProvider = "deepgram" | "browser";
export type TextToSpeechProvider = "elevenlabs" | "browser";

/** Settings the widget needs at runtime. Never includes anything secret. */
export interface SdkInitResponse {
  projectId: string;
  appearance: ProjectSettings["appearance"];
  behavior: Pick<ProjectSettings["behavior"], "mode" | "voiceEnabled">;
  masking: ProjectSettings["masking"];
  /** Which speech services the server can provide. "browser" means use the browser's built-in speech APIs. */
  voice: { stt: SpeechToTextProvider; tts: TextToSpeechProvider };
}

const identitySchema = z.object({
  userId: z.string().max(200),
  traits: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

/** Fields every SDK → API call carries so the server can check the project and who's asking. */
export const sdkCallerSchema = z.object({
  projectKey: z.string(),
  /** Random id the SDK stores in localStorage. */
  anonymousId: z.string().min(8).max(64),
  user: identitySchema.nullish(),
});


export const chatRequestSchema = sdkCallerSchema.extend({
  conversationId: z.string().max(64).nullish(),
  message: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
  inputMode: z.enum(["voice", "text"]).default("text"),
  page: z.object({
    url: z.string().max(2048),
    title: z.string().max(300).default(""),
    /** Redacted, LLM-friendly description of the page (see the SDK's snapshot module). */
    snapshot: z.string().max(MAX_SNAPSHOT_CHARS),
  }),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** Server-sent events streamed back from POST /api/v1/chat. */
export type ChatEvent =
  | { type: "meta"; conversationId: string }
  | { type: "text"; delta: string }
  | { type: "done" }
  | { type: "error"; message: string };

export const ttsRequestSchema = sdkCallerSchema.extend({
  text: z.string().trim().min(1).max(1_000),
});

export const voiceTokenRequestSchema = sdkCallerSchema;
export interface VoiceTokenResponse {
  provider: "deepgram";
  token: string;
  expiresIn: number;
}
