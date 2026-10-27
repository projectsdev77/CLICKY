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
  /** Collect page views and struggle signals (rage clicks, form errors…) for the friction map. */
  trackSignals: z.boolean().default(true),
});

export const maskingSchema = z.object({
  /** Mask emails, phone numbers, card numbers etc. before page data leaves the browser. */
  maskPII: z.boolean().default(true),
  /** Extra CSS selectors whose contents are always masked. */
  selectors: z.array(z.string()).default([]),
});

export const proactiveSchema = z.object({
  /** Offer help when someone seems stuck (rage clicks, repeated form errors, idle on a form). */
  enabled: z.boolean().default(false),
  /** Seconds on a form without submitting before Clicky offers help. */
  stuckSeconds: z.number().int().min(15).max(600).default(45),
});

export const handoffSchema = z.object({
  /** Where "Talk to a person" goes: a support page (https://…) or an email address (mailto:…). Empty = hidden. */
  url: z
    .string()
    .max(500)
    .regex(/^(https:\/\/|mailto:)/)
    .or(z.literal(""))
    .default(""),
  label: z.string().min(1).max(40).default("Talk to a person"),
});

export const workflowSchema = z.object({
  id: z.string().max(40),
  /** What the user is trying to do, e.g. "Invite a teammate". */
  name: z.string().min(1).max(80),
  /** The steps, in plain language, the way you'd explain them to a new support agent. */
  instructions: z.string().min(1).max(3000),
});
export type Workflow = z.infer<typeof workflowSchema>;

export const dataSchema = z.object({
  /** Conversations and signals older than this are deleted automatically. */
  retentionDays: z.number().int().min(7).max(730).default(90),
});

export const projectSettingsSchema = z.object({
  appearance: appearanceSchema.prefault({}),
  behavior: behaviorSchema.prefault({}),
  masking: maskingSchema.prefault({}),
  data: dataSchema.prefault({}),
  proactive: proactiveSchema.prefault({}),
  handoff: handoffSchema.prefault({}),
  workflows: z.array(workflowSchema).max(30).default([]),
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
