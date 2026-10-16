import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };

export type Database = ReturnType<typeof createDb>;

export function createDb(url: string) {
  return drizzle(postgres(url, { max: 10 }), { schema });
}
