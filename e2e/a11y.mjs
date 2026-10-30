// Accessibility audit (axe-core, WCAG 2 A + AA) of the widget, dashboard and public pages, in light and dark mode.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const axe = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
let failures = 0;
async function audit(page, label, include) {
  await page.addScriptTag({ content: axe });
  const r = await page.evaluate(async (inc) => (await window.axe.run(inc ? { include: [inc] } : document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0].target.join(" ") })), include);
  failures += r.length;
  console.log(r.length ? `✗ ${label}: ${JSON.stringify(r)}` : `✓ ${label}: no WCAG 2 A/AA violations`);
}
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ colorScheme: scheme });
  const visitor = await ctx.newPage();
  for (const p of ["/sign-in", "/sign-up", "/forgot-password", "/reset-password?token=x"]) {
    await visitor.goto(`http://localhost:3000${p}`);
    await audit(visitor, `${p} (${scheme})`);
  }
  await visitor.close();
  const app = await ctx.newPage();
  await app.goto("http://localhost:5173/reports");
  await app.locator("clicky-widget .launcher").click();
  await app.locator("clicky-widget input").fill("Where is the export button?");
  await app.locator("clicky-widget input").press("Enter");
  await app.waitForTimeout(2500);
  await audit(app, `widget (${scheme})`, ["clicky-widget"]);
  const dash = await ctx.newPage();
  await dash.goto("http://localhost:3000/sign-in");
  await dash.fill("input[name=email]", "demo@clicky.test");
  await dash.fill("input[name=password]", "password123");
  await dash.click("button[type=submit]");
  await dash.waitForURL(/projects/);
  for (const p of ["overview", "conversations", "friction", "knowledge", "settings", "install"]) {
    await dash.goto(`http://localhost:3000/projects/seed-project/${p}`);
    await audit(dash, `${p} (${scheme})`);
  }
  for (const p of ["/", "/pricing", "/billing", "/team", "/account"]) {
    await dash.goto(`http://localhost:3000${p}`);
    await audit(dash, `${p} (${scheme})`);
  }
}
await browser.close();
if (failures) { console.error(`FAIL: ${failures} accessibility violations`); process.exit(1); }
console.log("ALL PASSED");
