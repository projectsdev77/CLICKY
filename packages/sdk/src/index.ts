import { ClickyClient } from "./client";

export type { IdentifyOptions, InitOptions } from "./client";
export type { AppActionHandler } from "./agent/app-actions";
export type { AppActionInfo } from "@clicky/shared";

/** The Clicky singleton. Call `Clicky.init({ projectKey })` once when your app starts. */
export const Clicky = new ClickyClient();
