import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
const shots = process.env.SCREENSHOTS_DIR ?? new URL("./screenshots", import.meta.url).pathname;
mkdirSync(shots, { recursive: true });
const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("✓ " + m); };
const psql = (q) => execSync(`PGPASSWORD=postgres psql -h localhost -U postgres clicky -tAc "${q}"`).toString().trim();
psql("delete from conversation where project_id='seed-project'; update project set settings='{}', allowed_origins='{http://localhost:5173}' where id='seed-project'; delete from project where organization_id='seed-org' and id <> 'seed-project'");
psql("update subscription set plan='growth', status='active', trial_ends_at=null where organization_id='seed-org'; delete from usage_alert where organization_id='seed-org'");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

// 1. Public site.
const site = await ctx.newPage();
await site.goto("http://localhost:3000/");
ok(await site.getByRole("heading", { name: "An AI buddy that lives inside your product." }).isVisible(), "landing page renders");
await site.screenshot({ path: `${shots}/m4-landing.png`, fullPage: true });
await site.goto("http://localhost:3000/pricing");
ok(await site.getByText("$199").isVisible(), "pricing shows Growth monthly");
await site.getByRole("button", { name: "Yearly (save 20%)" }).click();
ok(await site.getByText("$159").isVisible(), "yearly toggle shows the discounted price");
await site.screenshot({ path: `${shots}/m4-pricing.png`, fullPage: true });
await site.goto("http://localhost:3000/docs");
ok(await site.getByText("data-clicky-mask").first().isVisible(), "docs render");

// 2. New organizations start a Growth trial.
const freshCtx = await browser.newContext();
const fresh = await freshCtx.newPage();
await fresh.goto("http://localhost:3000/sign-up");
await fresh.fill("input[name=name]", "Trial Tester");
await fresh.fill("input[name=email]", `trial+${Date.now()}@clicky.test`);
await fresh.fill("input[name=password]", "password123");
await fresh.click("button[type=submit]");
await fresh.waitForURL(/onboarding/);
await fresh.fill("input[name=organization]", "Initech");
await fresh.fill("input[name=project]", "Initech App");
await fresh.click("button[type=submit]");
await fresh.waitForURL(/install/);
ok(await fresh.getByText("Billing · Growth").isVisible() && await fresh.getByText(/Trial ends/).isVisible(), "new org is on a Growth trial");
await freshCtx.close();

// 3. Billing page and plan limits (demo org).
const dash = await ctx.newPage();
await dash.goto("http://localhost:3000/sign-in");
await dash.fill("input[name=email]", "demo@clicky.test");
await dash.fill("input[name=password]", "password123");
await dash.click("button[type=submit]");
await dash.waitForURL(/projects/);
await dash.goto("http://localhost:3000/billing");
ok(await dash.getByRole("meter", { name: "Conversations this month" }).isVisible(), "billing page shows usage meters");
await dash.screenshot({ path: `${shots}/m4-billing.png`, fullPage: true });

// Fill the Free plan's conversation allowance (100 × 1.2), then switch to Free.
const user = psql("select id from end_user where project_id='seed-project' limit 1") || (psql("insert into end_user (id, project_id, anonymous_id) values ('m4-user','seed-project','m4-anon-000') returning id"));
psql(`insert into conversation (id, project_id, end_user_id) select 'm4-' || g, 'seed-project', '${user}' from generate_series(1,120) g`);
await dash.getByRole("button", { name: "Free", exact: true }).click();
await dash.getByText("Billing · Free").waitFor();
ok(true, "switched to Free (dev switcher)");

const app = await ctx.newPage();
const w = app.locator("clicky-widget");
const idle = () => app.waitForFunction(() => document.querySelector("clicky-widget")?.shadowRoot?.querySelector("[data-status]")?.dataset.status === "idle", null, { timeout: 20000 });
await app.goto("http://localhost:5173/reports");
await w.locator(".launcher").click();
await w.locator("input").fill("please export as excel");
await w.locator("input").press("Enter");
await idle();
ok((await w.locator(".msg.assistant").allTextContents()).at(-1).includes("taking a break"), "over the limit: Clicky pauses politely");
ok(await app.locator("select[name=export-format]").inputValue() === "csv", "over the limit: nothing done");

// Under the limit on Free: answers, but guide-only (no actions).
// Owners hear about it by email (logged without an email provider), once per threshold.
if (process.env.WEB_LOG) {
  const alerts = () => readFileSync(process.env.WEB_LOG, "utf8").match(/has used 100% of this month's conversations/g)?.length ?? 0;
  await app.waitForTimeout(1000);
  ok(alerts() >= 1, "usage alert emailed at 100% of the conversation allowance");
}
ok(psql("select threshold from usage_alert where organization_id='seed-org' and metric='conversations'") === "100", "the 80% alert is skipped once usage is already past 100%");
psql("delete from conversation where id like 'm4-%'");
await dash.getByRole("button", { name: "Growth", exact: true }).click(); // clears the cached allowance
await dash.getByText("Billing · Growth").waitFor();
await dash.getByRole("button", { name: "Free", exact: true }).click();
await dash.getByText("Billing · Free").waitFor();
await w.locator("input").fill("please export as excel");
await w.locator("input").press("Enter");
await idle();
ok(!(await w.locator(".msg.assistant").allTextContents()).at(-1).includes("taking a break"), "under the limit on Free: Clicky answers");
ok((await w.locator(".step").count()) === 0 && await app.locator("select[name=export-format]").inputValue() === "csv", "Free plan: guides but doesn't act");

// Free: analytics limited to 7 days; one project only.
await dash.goto("http://localhost:3000/projects/seed-project/overview?days=90");
ok(await dash.getByText("Last 90 days 🔒").isVisible(), "longer analytics ranges locked on Free");
await dash.goto("http://localhost:3000/projects/new");
await dash.fill("input[name=name]", "Second app");
await dash.click("button[type=submit]");
await dash.getByText(/Free plan includes 1 project/).waitFor({ timeout: 10000 });
ok(psql("select count(*) from project where organization_id='seed-org'") === "1", "project limit enforced");

// Back to Growth: actions work again.
await dash.goto("http://localhost:3000/billing");
await dash.getByRole("button", { name: "Growth", exact: true }).click();
await dash.getByText("Billing · Growth").waitFor();
await w.locator("input").fill("please export as excel");
await w.locator("input").press("Enter");
await idle();
ok(await app.locator("select[name=export-format]").inputValue() === "xlsx", "Growth plan: Clicky acts again");

// Stripe webhook rejects unsigned calls.
const res = await fetch("http://localhost:3000/api/stripe/webhook", { method: "POST", body: "{}" });
ok(res.status === 400, "unsigned Stripe webhook rejected");

psql("delete from conversation where project_id='seed-project'");
await browser.close();
console.log("ALL PASSED");
