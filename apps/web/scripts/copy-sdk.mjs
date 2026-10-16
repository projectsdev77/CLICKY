// Copies the built <script>-tag SDK into public/ so it's served at /sdk/v1/clicky.js.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const sdkDir = dirname(require.resolve("@clicky/sdk/package.json"));
const outDir = new URL("../public/sdk/v1/", import.meta.url);
mkdirSync(outDir, { recursive: true });
copyFileSync(join(sdkDir, "dist/clicky.js"), new URL("clicky.js", outDir));
console.log("Copied SDK to public/sdk/v1/clicky.js");
