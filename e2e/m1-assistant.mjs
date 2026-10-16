import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
const shots = process.env.SCREENSHOTS_DIR ?? new URL("./screenshots", import.meta.url).pathname;
import { mkdirSync } from "node:fs";
mkdirSync(shots, { recursive: true });
const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("✓ " + m); };
const psql = (q) => execSync(`PGPASSWORD=postgres psql -h localhost -U postgres clicky -tAc "${q}"`).toString().trim();
psql("delete from knowledge_source where project_id='seed-project'; delete from conversation where project_id='seed-project'; update project set settings='{}', allowed_origins='{http://localhost:5173}' where id='seed-project'");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

// Fake speech APIs so push-to-talk and spoken replies can be tested headless.
await ctx.addInitScript(() => {
  window.__spoken = [];
  window.__nextUtterance = "how do I change my timezone";
  class FakeRecognition {
    start() {
      setTimeout(() => {
        const r = [{ transcript: window.__nextUtterance }]; r.isFinal = true;
        this.onresult?.({ resultIndex: 0, results: [r] });
      }, 100);
    }
    stop() { setTimeout(() => this.onend?.(), 50); }
    abort() { this.onend?.(); }
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  Object.defineProperty(window, "speechSynthesis", { value: {
    speak(u) { window.__spoken.push(u.text); setTimeout(() => { u.onstart?.(); setTimeout(() => u.onend?.(), 200); }, 20); },
    cancel() {},
  }});
});

// --- Dashboard: add the demo help center as a knowledge source.
const dash = await ctx.newPage();
await dash.goto("http://localhost:3000/sign-in");
await dash.fill("input[name=email]", "demo@clicky.test");
await dash.fill("input[name=password]", "password123");
await dash.click("button[type=submit]");
await dash.waitForURL(/install/);
await dash.goto("http://localhost:3000/projects/seed-project/knowledge");
await dash.fill("input[name=url]", "http://localhost:5173/help/index.html");
await dash.locator("form:has(input[name=url]) button").click();
await dash.getByText("4 pages").waitFor({ timeout: 30000 });
ok(true, "help center crawled: 4 pages ready");
await dash.screenshot({ path: `${shots}/m1-knowledge.png`, fullPage: true });

// --- Demo app: typed question -> streamed answer + pointer on the Export button.
const app = await ctx.newPage();
const chatBodies = [];
app.on("request", (r) => { if (r.url().endsWith("/api/v1/chat")) chatBodies.push(r.postDataJSON()); });
await app.goto("http://localhost:5173/reports");
const w = app.locator("clicky-widget");
await w.locator(".launcher").click();
await w.locator("input").fill("Where is the export button?");
await w.locator("input").press("Enter");
const lastReply = w.locator(".msg.assistant:not(.greeting)").last();
await app.waitForFunction(() => {
  const msgs = document.querySelector("clicky-widget").shadowRoot.querySelectorAll(".msg.assistant");
  const status = document.querySelector("clicky-widget").shadowRoot.querySelector("[data-status]").dataset.status;
  return status === "idle" && msgs[msgs.length - 1].textContent.length > 40;
}, null, { timeout: 15000 });
const reply = await lastReply.textContent();
ok(!reply.includes("{{"), "reply shown without point markers: " + JSON.stringify(reply.slice(0, 120)));
ok(/csv|excel|pdf/i.test(reply), "reply uses help-center knowledge");
await app.waitForTimeout(900);
const ring = await w.locator(".ptr-ring.on").boundingBox();
const exportBtn = await app.getByRole("button", { name: "Export", exact: true }).boundingBox();
ok(ring && Math.abs(ring.x + 4 - exportBtn.x) < 3 && Math.abs(ring.y + 4 - exportBtn.y) < 3, "pointer ring lands on the Export button");
await app.screenshot({ path: `${shots}/m1-pointer.png` });
ok(chatBodies[0].page.snapshot.includes('button "Export"'), "snapshot sent with the question");

// --- Voice: hold Alt+Space on the settings page.
await app.locator("nav a", { hasText: "Settings" }).click();
await app.keyboard.down("Alt");
await app.keyboard.down("Space");
await app.waitForTimeout(400);
await app.keyboard.up("Space");
await app.keyboard.up("Alt");
await app.waitForFunction(() => window.__spoken.length >= 1, null, { timeout: 15000 });
await app.waitForTimeout(800);
const spoken = await app.evaluate(() => window.__spoken);
ok(spoken.every((s) => !s.includes("{{")), "spoken sentences: " + JSON.stringify(spoken));
const userMsgs = await w.locator(".msg.user").allTextContents();
ok(userMsgs.at(-1) === "how do I change my timezone", "voice transcript sent as the question");
const ring2 = await w.locator(".ptr-ring.on").boundingBox();
const tz = await app.locator("select[name=timezone]").boundingBox();
ok(ring2 && Math.abs(ring2.y + 4 - tz.y) < 3, "pointer lands on the Timezone dropdown while speaking");
const lastBody = chatBodies.at(-1);
ok(lastBody.inputMode === "voice", "question marked as voice");
ok(!lastBody.page.snapshot.includes("jordan@acme.test") && lastBody.page.snapshot.includes("[email]"), "email masked in snapshot before leaving the browser");
await app.screenshot({ path: `${shots}/m1-voice.png` });

// --- Conversation survives a full page reload.
await app.reload();
await app.locator("clicky-widget .msg.user").first().waitFor({ state: "attached" });
const restored = await app.locator("clicky-widget .msg.user").allTextContents();
ok(restored.length === 2, "conversation restored after reload");

// --- Dashboard: conversation appears with both questions.
await dash.goto("http://localhost:3000/projects/seed-project/conversations");
await dash.getByText("Where is the export button?").click();
await dash.getByText("how do I change my timezone").waitFor();
ok(await dash.getByText("User (voice)").isVisible(), "conversation transcript shows voice question");
await dash.screenshot({ path: `${shots}/m1-conversation.png`, fullPage: true });

// --- Settings: rename the assistant and turn voice off.
await dash.goto("http://localhost:3000/projects/seed-project/settings");
await dash.fill("input[name=assistantName]", "Acme Buddy");
await dash.uncheck("input[name=voiceEnabled]");
await dash.locator("form:has(input[name=assistantName]) button[type=submit]").click();
await dash.getByText("Saved. Changes show up").waitFor();
await app.reload();
await w.locator(".launcher").waitFor({ state: "attached" });
ok((await w.locator(".launcher").getAttribute("aria-label")).includes("Acme Buddy"), "assistant renamed in widget");
ok(await w.locator(".mic").isHidden(), "mic hidden when voice is turned off");

// --- Tenant safety: another origin cannot use the key for chat.
const res = await fetch("http://localhost:3000/api/v1/chat", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
  body: JSON.stringify({ projectKey: "pk_demoDemoDemoDemoDemoDemo", anonymousId: "abcdefgh1234", message: "hi", page: { url: "https://evil.example", snapshot: "" } }) });
ok(res.status === 403, "chat from a non-allowed origin is refused");
psql("update project set settings='{}' where id='seed-project'");
await browser.close();
console.log("ALL PASSED");
