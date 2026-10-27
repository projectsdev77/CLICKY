import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };

export type Database = ReturnType<typeof createDb>;

export function createDb(url: string) {
  return drizzle(postgres(url, { max: 10 }), { schema });
}

// Re-exported so apps share this package's drizzle-orm instance (a second copy breaks type identity).
export { and, asc, count, countDistinct, desc, eq, gte, inArray, isNull, like, lt, lte, ne, or, sql } from "drizzle-orm";
