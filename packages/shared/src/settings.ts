import { z } from "zod";

export const appearanceSchema = z.object({
  assistantName: z.string().min(1).max(40).default("Clicky"),
  greeting: z.string().max(200).default("Hey! Hold Alt+Space and ask me anything."),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#6d28d9"),
  position: z.enum(["bottom-right", "bottom-left"]).default("bottom-right"),
  theme: z.enum(["light", "dark", "auto"]).default("auto"),
});

export const behaviorSchema = z.object({
  /** "agent" may act on the page; "guide" only explains and points. */
  mode: z.enum(["agent", "guide"]).default("agent"),
  voiceEnabled: z.boolean().default(true),
  customInstructions: z.string().max(4000).default(""),
  /** Glob-style URL path patterns where Clicky must not act (e.g. "/admin/*"). */
  blockedPaths: z.array(z.string()).default([]),
  /** Extra phrases that force a confirmation before the agent acts (on top of built-in ones). */
  confirmKeywords: z.array(z.string()).default([]),
});

export const maskingSchema = z.object({
  /** Mask emails, phone numbers, card numbers etc. before page data leaves the browser. */
  maskPII: z.boolean().default(true),
  /** Extra CSS selectors whose contents are always masked. */
  selectors: z.array(z.string()).default([]),
});

export const projectSettingsSchema = z.object({
  appearance: appearanceSchema.prefault({}),
  behavior: behaviorSchema.prefault({}),
  masking: maskingSchema.prefault({}),
});

export type ProjectSettings = z.infer<typeof projectSettingsSchema>;

export function defaultProjectSettings(): ProjectSettings {
  return projectSettingsSchema.parse({});
}

/** Parses stored settings, filling in defaults for anything missing or invalid. */
export function parseProjectSettings(raw: unknown): ProjectSettings {
  const result = projectSettingsSchema.safeParse(raw ?? {});
  return result.success ? result.data : defaultProjectSettings();
}
