import { defineConfig } from "tsup";
import pkg from "./package.json" with { type: "json" };

const define = { __SDK_VERSION__: JSON.stringify(pkg.version) };

export default defineConfig([
  {
    // npm package
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    noExternal: ["@clicky/shared"],
    define,
  },
  {
    // <script> tag build, served by the web app at /sdk/v1/clicky.js
    entry: { clicky: "src/script.ts" },
    format: ["iife"],
    minify: true,
    noExternal: ["@clicky/shared"],
    outExtension: () => ({ js: ".js" }),
    define,
  },
]);
