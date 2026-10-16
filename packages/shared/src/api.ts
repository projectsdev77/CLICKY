import { z } from "zod";
import type { ProjectSettings } from "./settings";

/** Sent by the SDK on load. Also how the dashboard detects a working install. */
export const sdkInitRequestSchema = z.object({
  projectKey: z.string(),
  url: z.string().url(),
  sdkVersion: z.string().max(32),
});
export type SdkInitRequest = z.infer<typeof sdkInitRequestSchema>;

/** Settings the widget needs at runtime. Never includes anything secret. */
export interface SdkInitResponse {
  projectId: string;
  appearance: ProjectSettings["appearance"];
  behavior: Pick<ProjectSettings["behavior"], "mode" | "voiceEnabled">;
  masking: ProjectSettings["masking"];
}
