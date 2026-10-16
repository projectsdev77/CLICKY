import "server-only";
import { createDb, type Database } from "@clicky/db";
import { env } from "./env";

// Reuse one connection pool across hot reloads in development.
const globalForDb = globalThis as unknown as { clickyDb?: Database };

export const db = globalForDb.clickyDb ?? createDb(env.DATABASE_URL);
if (process.env.NODE_ENV !== "production") globalForDb.clickyDb = db;
