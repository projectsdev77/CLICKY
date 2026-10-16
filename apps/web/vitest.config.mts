import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "server-only": new URL("./src/test/empty.ts", import.meta.url).pathname } },
  test: { include: ["src/**/*.test.ts"] },
});
