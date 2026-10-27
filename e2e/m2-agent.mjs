import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
const shots = process.env.SCREENSHOTS_DIR ?? new URL("./screenshots", import.meta.url).pathname;
mkdirSync(shots, { recursive: true });
const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("✓ " + m); };
const psql = (q) => execSync(`PGPASSWORD=postgres psql -h localhost -U postgres clicky -tAc "${q}"`).toString().trim();
const setSettings = (json) => psql(`update project set settings='${json}' where id='seed-project'`);
psql("delete from conversation where project_id='seed-project'; update project set allowed_origins='{http://localhost:5173}' where id='seed-project'");
setSettings("{}");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => {
  window.__spoken = [];
  window.__nextUtterance = "";
  class FakeRecognition {
    start() { setTimeout(() => { const r = [{ transcript: window.__nextUtterance }]; r.isFinal = true; this.onresult?.({ resultIndex: 0, results: [r] }); }, 100); }
    stop() { setTimeout(() => this.onend?.(), 50); }
    abort() { this.onend?.(); }
  }
  window.SpeechRecognition = window.webkitSpeechRecognition = FakeRecognition;
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  Object.defineProperty(window, "speechSynthesis", { value: {
    speak(u) { window.__spoken.push(u.text); setTimeout(() => { u.onstart?.(); setTimeout(() => u.onend?.(), 100); }, 20); },
    cancel() {},
  }});
});

const app = await ctx.newPage();
const w = app.locator("clicky-widget");
const idle = () => app.waitForFunction(() => document.querySelector("clicky-widget")?.shadowRoot?.querySelector("[data-status]")?.dataset.status === "idle", null, { timeout: 20000 });
const lastAssistant = async () => (await w.locator(".msg.assistant").allTextContents()).at(-1);
async function ask(text) {
  await w.locator("input").fill(text);
  await w.locator("input").press("Enter");
}
async function talk(utterance) {
  await app.evaluate((u) => (window.__nextUtterance = u), utterance);
  await app.keyboard.down("Alt"); await app.keyboard.down("Space");
  await app.waitForTimeout(300);
  await app.keyboard.up("Space"); await app.keyboard.up("Alt");
}

// 1. Do a multi-step task.
await app.goto("http://localhost:5173/reports");
await w.locator(".launcher").click();
await ask("please export as excel");
await idle();
ok(await app.locator("select[name=export-format]").inputValue() === "xlsx", "agent chose Excel in the dropdown");
ok(await app.getByText("Exported 3 reports as XLSX.").isVisible(), "agent clicked Export (app shows the export notice)");
ok((await w.locator(".step[data-status=done]").count()) === 2, "both steps shown as done");
ok((await lastAssistant()) === "Done.", "assistant reports back after checking the page");
await app.screenshot({ path: `${shots}/m2-steps.png` });

// 2. Risky step needs approval: decline, then allow.
await ask("please delete weekly traffic");
await w.locator(".confirm").waitFor();

ok(/Should I click delete/i.test(await w.locator(".confirm").textContent()), "asks before deleting");
await app.screenshot({ path: `${shots}/m2-confirm.png` });
await w.locator(".confirm button", { hasText: "Don't" }).click();
await idle();
ok(await app.getByRole("cell", { name: "Weekly traffic" }).isVisible(), "declined: nothing deleted");
ok((await lastAssistant()).includes("won't do that"), "assistant acknowledges the no");
await ask("please delete weekly traffic");
await w.locator(".confirm:not(.answered) button.allow").click();
await idle();
ok(!(await app.getByRole("cell", { name: "Weekly traffic" }).isVisible()), "allowed: row deleted");

// 3. Voice: ask by voice, approve by saying yes.
await talk("delete the signup funnel for me");
await w.locator(".confirm:not(.answered)").waitFor();
await app.waitForTimeout(300);
ok((await app.evaluate(() => window.__spoken)).includes("Should I click Delete?"), "confirmation question is spoken");
await talk("yes go ahead");
await idle();
ok(!(await app.getByRole("cell", { name: "Signup funnel" }).isVisible()), "voice 'yes' approves the step");

// 4. Teach mode: Clicky waits for the user to do it.
await ask("show me how to export");
await w.locator(".step[data-status=waiting]").waitFor();
ok((await w.locator(".step[data-status=waiting]").textContent()).includes("Export"), "teach mode waits for the user");
await app.getByRole("button", { name: "Export", exact: true }).click();
await idle();
ok((await w.locator(".step[data-status=done]").last().textContent()).includes("Export"), "continues once the user did it");

// 5. Navigation with a full page load: the run resumes on the new page.
await app.locator("nav a", { hasText: "Dashboard" }).click();
await ask("please open view all reports");
await app.waitForURL("**/reports");
await w.locator(".step[data-status=done]", { hasText: "View all reports" }).waitFor();
await idle();
ok((await lastAssistant()) === "Done.", "run resumed after the page reloaded and finished");
const runs = psql("select status from agent_run where project_id='seed-project' order by created_at desc limit 1");
ok(runs === "completed", "run marked completed in the database");

// 6. Blocked page.
setSettings('{\\"behavior\\": {\\"blockedPaths\\": [\\"/billing\\"]}}');
await app.goto("http://localhost:5173/billing");
await ask("please switch to growth");
await idle();
ok((await w.locator(".step").last().getAttribute("data-status")) === "blocked", "action blocked on an admin-blocked page");
ok((await w.locator(".confirm:not(.answered)").count()) === 0, "no confirmation asked for a blocked step");
ok(await app.getByText("Current plan: Starter").isVisible(), "plan unchanged");

// 7. Guide-only mode never acts.
setSettings('{\\"behavior\\": {\\"mode\\": \\"guide\\"}}');
await app.goto("http://localhost:5173/reports");
await w.locator(".launcher").waitFor({ state: "attached" });
const stepsBefore = await w.locator(".step").count();
await ask("please export as excel");
await idle();
ok((await w.locator(".step").count()) === stepsBefore, "guide mode: no actions taken");
ok(await app.locator("select[name=export-format]").inputValue() === "csv", "guide mode: page untouched");

// 8. Dashboard shows what Clicky did.
setSettings("{}");
const dash = await ctx.newPage();
await dash.goto("http://localhost:3000/sign-in");
await dash.fill("input[name=email]", "demo@clicky.test");
await dash.fill("input[name=password]", "password123");
await dash.click("button[type=submit]");
await dash.waitForURL(/\/projects\//);
await dash.goto("http://localhost:3000/projects/seed-project/conversations");
await dash.locator("ul a").first().click();
await dash.getByText("Click Delete").first().waitFor();
ok(await dash.getByText("user said no").first().isVisible(), "transcript shows the declined step");
ok(await dash.getByText("asked first").first().isVisible(), "transcript marks steps that needed approval");
await dash.screenshot({ path: `${shots}/m2-transcript.png`, fullPage: true });
await browser.close();
console.log("ALL PASSED");
