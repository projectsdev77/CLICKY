import "server-only";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

const isDev = process.env.NODE_ENV !== "production";

export const env = {
  DATABASE_URL: required("DATABASE_URL", isDev ? "postgres://postgres:postgres@localhost:5432/clicky" : undefined),
  BETTER_AUTH_SECRET: required("BETTER_AUTH_SECRET", isDev ? "dev-secret-change-me-dev-secret-change-me" : undefined),
  APP_URL: required("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  /** Without a key (or an `ant auth login` profile) the assistant runs a local stand-in model. */
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ASSISTANT_MODEL: process.env.CLICKY_ASSISTANT_MODEL ?? "claude-opus-5-5",
  /** Cheaper model for background work: grouping questions into topics. */
  CLASSIFIER_MODEL: process.env.CLICKY_CLASSIFIER_MODEL ?? "claude-haiku-5-5",
  /** Set to "stub" to force the local stand-in even when a key is present (tests, demos). */
  ASSISTANT_PROVIDER: process.env.CLICKY_ASSISTANT_PROVIDER,
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM",
  ELEVENLABS_MODEL_ID: process.env.ELEVENLABS_MODEL_ID ?? "eleven_flash_v2_5",
};
