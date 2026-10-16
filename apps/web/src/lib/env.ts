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
};
