import { z } from "zod";
import type { ProjectSettings } from "./settings";
import { MAX_QUESTION_CHARS, MAX_SNAPSHOT_CHARS } from "./limits";
import type { AgentAction } from "./agent";

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
  behavior: Pick<ProjectSettings["behavior"], "mode" | "voiceEnabled" | "blockedPaths" | "confirmKeywords" | "trackSignals">;
  masking: ProjectSettings["masking"];
  proactive: ProjectSettings["proactive"];
  handoff: ProjectSettings["handoff"];
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


const pageSchema = z.object({
  url: z.string().max(2048),
  title: z.string().max(300).default(""),
  /** Redacted, LLM-friendly description of the page (see the SDK's snapshot module). */
  snapshot: z.string().max(MAX_SNAPSHOT_CHARS),
});

export const chatRequestSchema = sdkCallerSchema.extend({
  conversationId: z.string().max(64).nullish(),
  message: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
  inputMode: z.enum(["voice", "text"]).default("text"),
  page: pageSchema,
});

/** Sent after the widget has carried out the actions from an `actions` event. */
export const chatContinueRequestSchema = sdkCallerSchema.extend({
  runId: z.string().max(64),
  results: z
    .array(
      z.object({
        id: z.string().max(128),
        status: z.enum(["done", "failed", "declined", "blocked", "skipped", "timeout"]),
        output: z.string().max(2000),
      }),
    )
    .max(20),
  /** The user pressed Stop: record it and end the run without calling the model. */
  cancel: z.boolean().default(false),
  page: pageSchema,
});
export type ChatContinueRequest = z.infer<typeof chatContinueRequestSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** Server-sent events streamed back from POST /api/v1/chat. */
export type ChatEvent =
  | { type: "meta"; conversationId: string; runId: string }
  /** The assistant wants the widget to do these, in order, then call /chat/continue with the results. */
  | { type: "actions"; runId: string; actions: AgentAction[] }
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

export const EVENT_TYPES = [
  "pageview",
  "rage_click",
  "dead_click",
  "form_error",
  "form_stuck",
  "custom",
  "nudge_shown",
  "nudge_accepted",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const eventsRequestSchema = sdkCallerSchema.extend({
  sessionId: z.string().min(8).max(64),
  events: z
    .array(
      z.object({
        type: z.enum(EVENT_TYPES),
        path: z.string().max(500),
        element: z.string().max(200).nullish(),
        props: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).optional(),
        /** Client timestamp (ms). Clamped server-side. */
        at: z.number(),
      }),
    )
    .min(1)
    .max(50),
});
export type EventsRequest = z.infer<typeof eventsRequestSchema>;
export type SdkEvent = EventsRequest["events"][number];

export const feedbackRequestSchema = sdkCallerSchema.extend({
  conversationId: z.string().max(64),
  rating: z.union([z.literal(1), z.literal(-1)]),
});

export const handoffRequestSchema = sdkCallerSchema.extend({
  conversationId: z.string().max(64),
});
export interface HandoffResponse {
  /** Plain-text transcript to pass to the support channel. */
  transcript: string;
}
