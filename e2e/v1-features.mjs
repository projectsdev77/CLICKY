// Post-MVP features: proactive nudges, human handoff (more added as they're built).
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
const shots = process.env.SCREENSHOTS_DIR ?? new URL("./screenshots", import.meta.url).pathname;
mkdirSync(shots, { recursive: true });
const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("✓ " + m); };
const psql = (q) => execSync(`PGPASSWORD=postgres psql -h localhost -U postgres clicky -tAc "${q}"`).toString().trim();
const setSettings = (json) => psql(`update project set settings='${json}' where id='seed-project'`);
psql("delete from conversation where project_id='seed-project'; delete from event where project_id='seed-project'; update project set allowed_origins='{http://localhost:5173}' where id='seed-project'");
psql("insert into subscription (organization_id, plan, status) values ('seed-org','growth','active') on conflict (organization_id) do update set plan='growth', status='active', trial_ends_at=null");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const app = await ctx.newPage();
const w = app.locator("clicky-widget");
const idle = () => app.waitForFunction(() => document.querySelector("clicky-widget")?.shadowRoot?.querySelector("[data-status]")?.dataset.status === "idle", null, { timeout: 20000 });

// --- Proactive nudges
setSettings('{\\"proactive\\": {\\"enabled\\": true}, \\"handoff\\": {\\"url\\": \\"https://support.example.com/new\\", \\"label\\": \\"Talk to a person\\"}}');
await app.goto("http://localhost:5173/reports");
await w.locator(".launcher").waitFor({ state: "attached" });
for (let i = 0; i < 3; i++) await app.getByRole("button", { name: "Export", exact: true }).click();
await w.locator(".nudge:not([hidden])").waitFor();
ok((await w.locator(".nudge").textContent()).includes("“Export” not working?"), "rage clicks trigger a nudge naming the element");
await app.screenshot({ path: `${shots}/v1-nudge.png` });
await w.locator(".nudge button.yes").click();
await idle();
ok((await w.locator(".msg.user").last().textContent()).includes('I keep clicking "Export"'), "accepting the nudge asks for help with context");
for (let i = 0; i < 3; i++) await app.getByRole("button", { name: "Export", exact: true }).click();
await app.waitForTimeout(500);
ok(await w.locator(".nudge").isHidden(), "only one nudge per page");

// Repeated form errors on another page (panel closed).
await w.locator(".header button[aria-label^=Close]").click();
await app.locator("nav a", { hasText: "Settings" }).click();
await app.getByRole("button", { name: "Save changes" }).click();
await app.getByRole("button", { name: "Save changes" }).click();
await w.locator(".nudge:not([hidden])").waitFor();
ok((await w.locator(".nudge").textContent()).includes("Stuck on this form?"), "repeated form errors trigger a nudge");
await w.locator(".nudge button", { hasText: "No thanks" }).click();

// Nudges off: no bubble.
setSettings('{\\"handoff\\": {\\"url\\": \\"https://support.example.com/new\\"}}');
await app.goto("http://localhost:5173/billing");
await w.locator(".launcher").waitFor({ state: "attached" });
for (let i = 0; i < 3; i++) await app.getByRole("button", { name: "Update card" }).click();
await app.waitForTimeout(500);
ok(await w.locator(".nudge").isHidden(), "no nudges when the team hasn't turned them on");

// --- Human handoff
await ctx.route("https://support.example.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Support</h1>" }));
await w.locator(".launcher").click();
const [popup] = await Promise.all([ctx.waitForEvent("page"), w.locator(".handoff").click()]);
await popup.waitForURL(/support\.example\.com/);
const convo = psql("select id from conversation where project_id='seed-project' order by created_at desc limit 1");
ok(popup.url().startsWith("https://support.example.com/new?clicky_conversation=" + convo), "handoff opens the support page with the conversation id");
await popup.close();
ok(psql(`select outcome from conversation where id='${convo}'`) === "escalated", "conversation marked escalated");
ok((await w.locator(".msg.assistant").last().textContent()).includes("passed this conversation along"), "user is told it was passed on");

setSettings("{}");
psql("delete from conversation where project_id='seed-project'; delete from event where project_id='seed-project'");
await browser.close();
console.log("ALL PASSED");
