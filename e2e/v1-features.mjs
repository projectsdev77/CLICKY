// Post-MVP features: proactive nudges, human handoff (more added as they're built).
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
const shots = process.env.SCREENSHOTS_DIR ?? new URL("./screenshots", import.meta.url).pathname;
mkdirSync(shots, { recursive: true });
const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("✓ " + m); };
// No shell: queries contain JSON with quotes and spaces.
const psql = (q) =>
  execFileSync("psql", ["-h", "localhost", "-U", "postgres", "clicky", "-tAc", q], { env: { ...process.env, PGPASSWORD: "postgres" } })
    .toString()
    .trim();
const setSettings = (json) => psql(`update project set settings='${json}' where id='seed-project'`);
psql("delete from conversation where project_id='seed-project'; delete from event where project_id='seed-project'; update project set allowed_origins='{http://localhost:5173}' where id='seed-project'");
psql("insert into subscription (organization_id, plan, status) values ('seed-org','growth','active') on conflict (organization_id) do update set plan='growth', status='active', trial_ends_at=null");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const app = await ctx.newPage();
const w = app.locator("clicky-widget");
const idle = () => app.waitForFunction(() => document.querySelector("clicky-widget")?.shadowRoot?.querySelector("[data-status]")?.dataset.status === "idle", null, { timeout: 20000 });

// --- Proactive nudges
setSettings('{"proactive": {"enabled": true}, "handoff": {"url": "https://support.example.com/new", "label": "Talk to a person"}}');
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
setSettings('{"handoff": {"url": "https://support.example.com/new"}}');
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

// --- Registered app actions
setSettings("{}");
await app.goto("http://localhost:5173/reports");
await w.locator(".launcher").waitFor({ state: "attached" });
if (!(await w.locator(".panel").isVisible())) await w.locator(".launcher").click();
// The demo (Vite dev mode) registers its action once React has mounted, a moment after Clicky loads.
await app.waitForFunction(() => window.Clicky?.assistant?.appActions.list().length > 0);
await w.locator("input").fill("please export reports as pdf");
await w.locator("input").press("Enter");
await idle();
ok(await app.getByText("Exported 3 reports as PDF (via app action).").isVisible(), "Clicky calls the app's registered action with the right arguments");
ok(psql("select output from agent_action where name='app_action' order by created_at desc limit 1").includes('"format":"pdf"'), "the app's return value goes back to the assistant");

// --- Workflows (dashboard)
const dash = await ctx.newPage();
await dash.goto("http://localhost:3000/sign-in");
await dash.fill("input[name=email]", "demo@clicky.test");
await dash.fill("input[name=password]", "password123");
await dash.click("button[type=submit]");
await dash.waitForURL(/projects/);
await dash.goto("http://localhost:3000/projects/seed-project/workflows");
await dash.fill("input[name=name]", "Change your timezone");
await dash.fill("textarea[name=instructions]", "1. Open Settings.\n2. Pick a timezone.\n3. Click Save changes.");
await dash.getByRole("button", { name: "Add workflow" }).click();
await dash.getByText("Saved. Clicky will follow it").waitFor();
ok(psql("select settings->'workflows'->0->>'name' from project where id='seed-project'") === "Change your timezone", "workflow saved to the project");
await dash.reload();
await dash.getByText("Change your timezone").click();
await dash.getByRole("button", { name: "Remove" }).click();
await dash.getByText("No workflows yet.").waitFor();
ok(true, "workflow removed");

// --- Onboarding checklist
setSettings('{\"onboarding\": {\"enabled\": true, \"title\": \"Get started\", \"steps\": [' +
  '{\"id\": \"s1\", \"title\": \"Open your settings\", \"doneWhen\": {\"type\": \"page\", \"value\": \"/settings\"}},' +
  '{\"id\": \"s2\", \"title\": \"Export a report\", \"doneWhen\": {\"type\": \"click\", \"value\": \"Export\"}},' +
  '{\"id\": \"s3\", \"title\": \"Save your timezone\", \"doneWhen\": {\"type\": \"event\", \"value\": \"settings_saved\"}}]}}');
psql("delete from onboarding_completion where project_id='seed-project'");
const newbie = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const nw = newbie.locator("clicky-widget");
await newbie.goto("http://localhost:5173/reports");
await nw.locator(".badge:not([hidden])").waitFor({ state: "attached" });
ok(true, "launcher shows a badge while onboarding steps remain");
await nw.locator(".launcher").click();
ok((await nw.locator(".checklist .title").textContent()) === "Get started · 0 of 3", "new user sees the checklist");
await newbie.screenshot({ path: `${shots}/v1-onboarding.png` });
await newbie.getByRole("button", { name: "Export", exact: true }).click();
await nw.locator(".checklist li.done", { hasText: "Export a report" }).waitFor();
ok(true, "clicking the button ticks off a click step");
await newbie.locator("nav a", { hasText: "Settings" }).click();
await nw.locator(".checklist li.done", { hasText: "Open your settings" }).waitFor();
ok(true, "visiting the page ticks off a page step");
await nw.getByRole("button", { name: "Show me how to Save your timezone" }).click();
await nw.locator(".step[data-status=waiting]").waitFor();
ok((await nw.locator(".msg.user").last().textContent()) === "Show me how to save your timezone", "Show me starts a walkthrough");
await newbie.locator("select[name=timezone]").selectOption("Europe/London");
await newbie.getByRole("button", { name: "Save changes" }).click();
await nw.getByText("Get started: all done! 🎉").waitFor();
ok(true, "a tracked event ticks off the last step");
await newbie.waitForTimeout(500);
ok(psql("select count(*) from onboarding_completion where project_id='seed-project'") === "3", "completions saved");
ok(await nw.locator(".badge").isHidden(), "badge goes away when done");

// Funnel on the dashboard
await dash.goto("http://localhost:3000/projects/seed-project/onboarding");
ok((await dash.getByText(/\(1\)/).count()) === 3, "funnel counts one completion per step");
await dash.screenshot({ path: `${shots}/v1-onboarding-funnel.png`, fullPage: true });

// Old users don't see it
psql("update end_user set first_seen_at = now() - interval '30 days' where project_id='seed-project'");
await newbie.reload();
await nw.locator(".launcher").waitFor({ state: "attached" });
await newbie.waitForTimeout(1000);
ok(await nw.locator(".checklist").isHidden(), "users past the audience window don't see the checklist");

setSettings("{}");
psql("delete from conversation where project_id='seed-project'; delete from event where project_id='seed-project'; delete from onboarding_completion where project_id='seed-project'");
await browser.close();
console.log("ALL PASSED");
