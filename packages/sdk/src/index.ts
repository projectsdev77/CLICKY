import { ClickyClient } from "./client";

export type { IdentifyOptions, InitOptions } from "./client";

/** The Clicky singleton. Call `Clicky.init({ projectKey })` once when your app starts. */
export const Clicky = new ClickyClient();
