import { APP_ACTION_NAME_RE, type AppActionInfo } from "@clicky/shared/client";

export type AppActionHandler = (args: Record<string, unknown>) => unknown;

interface Registered extends AppActionInfo {
  handler: AppActionHandler;
}

/** Functions the host app exposes to Clicky with Clicky.registerAction(). */
export class AppActionRegistry {
  private actions = new Map<string, Registered>();

  register(name: string, info: Omit<AppActionInfo, "name">, handler: AppActionHandler) {
    if (!APP_ACTION_NAME_RE.test(name)) throw new Error(`[clicky] invalid action name "${name}" (letters, digits, _ . -)`);
    if (typeof handler !== "function") throw new Error("[clicky] registerAction needs a handler function");
    this.actions.set(name, { ...info, name, description: String(info.description ?? "").slice(0, 300), handler });
    return () => this.unregister(name);
  }

  unregister(name: string) {
    this.actions.delete(name);
  }

  /** What's sent to the server with each question (no handlers). */
  list(): AppActionInfo[] {
    return Array.from(this.actions.values())
      .slice(0, 30)
      .map(({ name, description, parameters, confirm }) => ({ name, description, parameters, confirm }));
  }

  get(name: string) {
    return this.actions.get(name);
  }
}

/** Checks required arguments and simple types before calling the app's handler. */
export function validateArgs(info: AppActionInfo, args: Record<string, unknown>): string | null {
  for (const key of info.parameters?.required ?? []) {
    if (args[key] === undefined || args[key] === null || args[key] === "") return `Missing "${key}".`;
  }
  for (const [key, spec] of Object.entries(info.parameters?.properties ?? {})) {
    const value = args[key];
    if (value === undefined) continue;
    if (spec.enum && !spec.enum.includes(value)) return `"${key}" must be one of ${spec.enum.map((v) => JSON.stringify(v)).join(", ")}.`;
    const type = spec.type;
    if (type === "string" && typeof value !== "string") return `"${key}" must be text.`;
    if ((type === "number" || type === "integer") && typeof value !== "number") return `"${key}" must be a number.`;
    if (type === "boolean" && typeof value !== "boolean") return `"${key}" must be true or false.`;
  }
  return null;
}
