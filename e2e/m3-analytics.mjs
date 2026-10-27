import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
const shots = process.env.SCREENSHOTS_DIR ?? new URL("./screenshots", import.meta.url).pathname;
mkdirSync(shots, { recursive: true });
const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("✓ " + m); };
const psql = (q) => execSync(`PGPASSWORD=postgres psql -h localhost -U postgres clicky -tAc "${q}"`).toString().trim();
psql("delete from conversation where project_id='seed-project'; delete from event where project_id='seed-project'; delete from topic where project_id='seed-project'; update project set settings='{}', allowed_origins='{http://localhost:5173}' where id='seed-project'");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const app = await ctx.newPage();
const w = app.locator("clicky-widget");
const idle = () => app.waitForFunction(() => document.querySelector("clicky-widget")?.shadowRoot?.querySelector("[data-status]")?.dataset.status === "idle", null, { timeout: 20000 });
async function ask(text) {
  await w.locator("input").fill(text);
  await w.locator("input").press("Enter");
  await idle();
}

// 1. Questions + feedback.
await app.goto("http://localhost:5173/reports");
await w.locator(".launcher").click();
await ask("Where is the export button?");
await w.locator(".feedback button[aria-label=Helpful]").click();
ok(await w.getByText("Thanks!").isVisible(), "feedback control thanks the user");
await ask("what is the meaning of life");
const convoId = psql("select id from conversation where project_id='seed-project' order by created_at desc limit 1");
ok(psql(`select feedback from conversation where id='${convoId}'`) === "1", "thumbs up saved on the conversation");

// 2. Struggle signals: rage clicks on Export, form error on Settings.
for (let i = 0; i < 4; i++) await app.getByRole("button", { name: "Export", exact: true }).click({ delay: 0 });
await app.locator("nav a", { hasText: "Settings" }).click();
await app.getByRole("button", { name: "Save changes" }).click();
await app.waitForTimeout(11_000); // one flush interval
const types = psql("select string_agg(distinct type, ',' order by type) from event where project_id='seed-project'");
ok(types.includes("pageview") && types.includes("rage_click") && types.includes("form_error"), `signals recorded: ${types}`);
ok(psql("select count(*) from event where project_id='seed-project' and element like '%acme.test%'") === "0", "no personal data in events");

// 3. Topics and knowledge gaps (background classification after each reply).
await app.waitForTimeout(1500);
const classified = psql("select count(*) from message m join conversation c on c.id=m.conversation_id where c.project_id='seed-project' and m.role='user' and m.topic_id is not null");
ok(classified === "2", "both questions grouped into topics");
ok(psql("select count(*) from message m join conversation c on c.id=m.conversation_id where c.project_id='seed-project' and m.answered=false") === "1", "unanswered question flagged as a knowledge gap");

// 4. Dashboard pages.
const dash = await ctx.newPage();
await dash.goto("http://localhost:3000/sign-in");
await dash.fill("input[name=email]", "demo@clicky.test");
await dash.fill("input[name=password]", "password123");
await dash.click("button[type=submit]");
await dash.waitForURL(/projects/);
await dash.goto("http://localhost:3000/projects/seed-project/overview");
ok((await dash.locator("text=Conversations >> xpath=following-sibling::p[1]").first().textContent()) === "1", "overview counts the conversation");
ok(await dash.getByText("100%").first().isVisible(), "rated helpful shows 100%");
await dash.screenshot({ path: `${shots}/m3-overview.png`, fullPage: true });
await dash.goto("http://localhost:3000/projects/seed-project/friction");
const reportsRow = dash.locator("tr", { has: dash.locator("td", { hasText: /^\/reports$/ }) });
ok((await reportsRow.locator("td").nth(3).textContent()) === "1", "friction map shows the rage click on /reports");
ok(await dash.getByText('button "Export"').isVisible(), "problem elements lists the Export button");
await dash.goto("http://localhost:3000/projects/seed-project/knowledge");
ok(await dash.getByText("what is the meaning of life").isVisible(), "knowledge gaps lists the unanswered question");
await dash.getByRole("link", { name: "Write an answer" }).click();
await dash.waitForURL(/question=/);
ok((await dash.locator("input[name=title]").inputValue()) === "what is the meaning of life", "write-an-answer prefills the article title");
await dash.goto("http://localhost:3000/projects/seed-project/conversations?rating=up");
ok((await dash.locator("ul a").count()) === 1 && (await dash.getByText("Where is the export button?").isVisible()), "conversations filter by 👍");
await browser.close();
psql("delete from conversation where project_id='seed-project'; delete from event where project_id='seed-project'");
console.log("ALL PASSED");
