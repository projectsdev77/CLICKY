import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
execSync(`PGPASSWORD=postgres psql -h localhost -U postgres clicky -qc "update project set last_seen_at=null, allowed_origins='{http://localhost:5173}' where id='seed-project'"`);
const tmEmail = `tm+${Date.now()}@clicky.test`;
const shots = process.env.SCREENSHOTS_DIR ?? new URL("./screenshots", import.meta.url).pathname;
import { mkdirSync } from "node:fs";
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("✓ " + m); };

// 1. Seeded user sees "waiting", then the demo app loads Clicky, then status flips to installed.
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto("http://localhost:3000/dashboard");
ok(page.url().includes("/sign-in"), "signed-out user redirected to sign-in");
await page.fill('input[name=email]', "demo@clicky.test");
await page.fill('input[name=password]', "password123");
await page.click('button[type=submit]');
await page.waitForURL(/\/projects\/seed-project\/install/);
ok(true, "sign-in lands on install page");
await page.getByText("Waiting for Clicky").waitFor();
ok(true, "install page shows waiting state");
await page.screenshot({ path: `${shots}/install-waiting.png`, fullPage: true });

const demo = await ctx.newPage();
const consoleMsgs = [];
demo.on("console", (m) => consoleMsgs.push(m.text()));
await demo.goto("http://localhost:5173/reports");
await demo.locator("clicky-widget").waitFor({ state: "attached", timeout: 10000 });
const launcher = demo.locator("clicky-widget").locator("button.launcher");
await launcher.click();
ok(await demo.locator("clicky-widget").getByText("Hey! Hold Alt+Space").isVisible(), "widget mounts on demo app and opens");
await demo.screenshot({ path: `${shots}/demo-widget.png` });

await page.getByText("Clicky is installed").waitFor({ timeout: 10000 });
ok(true, "install page detects the SDK");
await page.screenshot({ path: `${shots}/install-done.png`, fullPage: true });

// 2. Disallowed origin: remove localhost from allowed websites -> widget does not load.
await page.fill('textarea[name=origins]', "https://app.acme.com");
await page.click('text=Save websites');
await page.getByText("Saved.").waitFor();
const demo2 = await ctx.newPage();
const warnings = [];
demo2.on("console", (m) => warnings.push(m.text()));
await demo2.goto("http://localhost:5173/");
await demo2.waitForTimeout(2000);
ok((await demo2.locator("clicky-widget").count()) === 0, "widget blocked on non-allowed origin");
ok(warnings.some((w) => w.includes("[clicky]")), "SDK logs a quiet warning: " + warnings.find((w) => w.includes("[clicky]")));
await page.fill('textarea[name=origins]', "http://localhost:5173");
await page.click('text=Save websites');
await page.getByText("Saved.").waitFor();

// 3. Invite a teammate.
await page.goto("http://localhost:3000/team");
await page.fill('input[name=email]', tmEmail);
await page.click('text=Send invite');
await page.getByText("Invitation sent").waitFor();
const inviteUrl = await page.locator("span.font-mono", { hasText: "/invite/" }).first().textContent();
ok(inviteUrl.includes("/invite/"), "invitation link shown: " + inviteUrl);

// 4. New user: sign up -> onboarding -> project; then accept the invite.
const ctx2 = await browser.newContext();
const p2 = await ctx2.newPage();
await p2.goto(inviteUrl);
await p2.waitForURL(/sign-in/);
await p2.click("text=Create an account");
await p2.fill('input[name=name]', "Tee Mate");
await p2.fill('input[name=email]', tmEmail);
await p2.fill('input[name=password]', "password123");
await p2.click('button[type=submit]');
await p2.waitForURL(/\/invite\//);
await p2.click("text=Accept invitation");
await p2.waitForURL(/\/projects\/seed-project\//);
await p2.goto("http://localhost:3000/projects/seed-project/install");
ok(true, "invitee joins Acme and lands on its project");
ok((await p2.locator("textarea[name=origins]").isDisabled()), "viewer cannot edit allowed websites");

const ctx3 = await browser.newContext();
const p3 = await ctx3.newPage();
await p3.goto("http://localhost:3000/sign-up");
await p3.fill('input[name=name]', "Nia New");
await p3.fill('input[name=email]', `nia+${Date.now()}@clicky.test`);
await p3.fill('input[name=password]', "password123");
await p3.click('button[type=submit]');
await p3.waitForURL(/onboarding/);
await p3.screenshot({ path: `${shots}/onboarding.png`, fullPage: true });
await p3.fill('input[name=organization]', "Globex");
await p3.fill('input[name=project]', "Globex App");
await p3.fill('input[name=origin]', "app.globex.com");
await p3.click('button[type=submit]');
await p3.waitForURL(/\/install/);
ok(await p3.locator("textarea[name=origins]").inputValue() === "https://app.globex.com", "onboarding creates org+project with normalized origin");
const foreign = await p3.goto("http://localhost:3000/projects/seed-project/install");
ok(foreign.status() === 404, "other org's project returns 404");
await browser.close();
console.log("ALL PASSED");
