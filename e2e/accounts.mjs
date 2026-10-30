// Accounts and teams: email verification, password reset, two-step verification, team management, account deletion.
// Emails are read from the web server's log (set WEB_LOG to its path), since no email provider is configured in tests.
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("✓ " + m); };
const psql = (q) => execFileSync("psql", ["-h", "localhost", "-U", "postgres", "clicky", "-tAc", q], { env: { ...process.env, PGPASSWORD: "postgres" } }).toString().trim();
const LOG = process.env.WEB_LOG;
if (!LOG) throw new Error("Set WEB_LOG to the web server's log file");

/** Waits for an email to `to` whose subject matches, and returns the first link in it. */
async function emailLink(to, subject) {
  for (let i = 0; i < 50; i++) {
    const log = readFileSync(LOG, "utf8");
    const blocks = log.split("[email] ").filter((b) => b.startsWith(`to=${to} `) && subject.test(b));
    const url = blocks.at(-1)?.match(/https?:\/\/\S+/)?.[0];
    if (url) return url;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`no email to ${to} matching ${subject}`);
}

/** RFC 6238 TOTP, so the test can act as the user's authenticator app. */
function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const stamp = Date.now();
const owner = `owner+${stamp}@clicky.test`;
const mate = `mate+${stamp}@clicky.test`;

async function signUp(email, name) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("http://localhost:3000/sign-up");
  await page.fill("input[name=name]", name);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.click("button[type=submit]");
  await page.waitForURL(/onboarding/);
  return page;
}

// 1. Sign-up sends a confirmation email; following it confirms the address.
const o = await signUp(owner, "Olu Owner");
await o.fill("input[name=organization]", "Umbrella");
await o.fill("input[name=project]", "Umbrella App");
await o.click("button[type=submit]");
await o.waitForURL(/install/);
ok(await o.getByText("Please confirm your email").isVisible(), "unconfirmed users see a banner");
await o.goto(await emailLink(owner, /Confirm your email/));
await o.waitForURL(/dashboard|projects/);
ok(!(await o.getByText("Please confirm your email").isVisible()), "confirming the email removes the banner");

// 2. Password reset.
const r = await (await browser.newContext()).newPage();
await r.goto("http://localhost:3000/sign-in");
await r.getByRole("link", { name: "Forgot your password?" }).click();
await r.fill("input[name=email]", owner);
await r.click("button[type=submit]");
await r.getByText(/we've emailed a link/).waitFor();
await r.goto(await emailLink(owner, /Reset your Clicky password/));
await r.waitForURL(/reset-password\?token=/);
await r.fill("input[name=password]", "new-password-456");
await r.fill("input[name=confirm]", "new-password-456");
await r.click("button[type=submit]");
await r.waitForURL(/sign-in\?reset=1/);
await r.fill("input[name=email]", owner);
await r.fill("input[name=password]", "password123");
await r.click("button[type=submit]");
ok(await r.getByText(/invalid/i).waitFor().then(() => true), "old password no longer works");
await r.fill("input[name=password]", "new-password-456");
await r.click("button[type=submit]");
await r.waitForURL(/projects/);
ok(true, "new password works");

// 3. Two-step verification.
await r.goto("http://localhost:3000/account");
await r.locator("input[name=password]").first().fill("new-password-456");
await r.getByRole("button", { name: "Set up" }).click();
const secret = await r.locator("code").first().textContent();
await r.fill("input[name=code]", totp(secret));
await r.getByRole("button", { name: "Turn on" }).click();
await r.getByText("Two-step verification is on.").waitFor();
ok(psql(`select two_factor_enabled from "user" where email='${owner}'`) === "t", "two-step verification turned on");
const t = await (await browser.newContext()).newPage();
await t.goto("http://localhost:3000/sign-in");
await t.fill("input[name=email]", owner);
await t.fill("input[name=password]", "new-password-456");
await t.click("button[type=submit]");
await t.waitForURL(/two-factor/);
ok(true, "sign-in asks for a code");
await t.fill("input[name=code]", "000000");
await t.getByRole("button", { name: "Verify" }).click();
await t.locator("p.text-red-600").waitFor();
ok(true, "a wrong code is rejected");
await t.fill("input[name=code]", totp(secret));
await t.getByRole("button", { name: "Verify" }).click();
await t.waitForURL(/projects|dashboard/);
ok(true, "the right code signs in");

// 4. Team management.
await t.goto("http://localhost:3000/team");
await t.fill("input[name=email]", mate);
await t.getByRole("button", { name: "Send invite" }).click();
await t.getByText("Invitation sent").waitFor();
const m = await signUp(mate, "Mo Mate");
await m.goto(await emailLink(mate, /invited you to Umbrella/));
await m.getByRole("button", { name: "Accept invitation" }).click();
await m.waitForURL(/projects/, { timeout: 60000 });
await t.reload();
await t.getByLabel("Role for Mo Mate").selectOption("admin");
await t.locator("li", { hasText: "Mo Mate" }).getByRole("button", { name: "Save" }).click();
await t.waitForTimeout(500);
ok(psql(`select m.role from member m join "user" u on u.id=m.user_id where u.email='${mate}'`) === "admin", "owner can make a member an admin");
await t.reload();
await t.locator("input[name=name]").first().fill("Umbrella Corp");
await t.locator("form", { has: t.locator("input[name=name]") }).first().getByRole("button", { name: "Save" }).click();
await t.getByText("Saved.").waitFor();
ok(psql(`select o.name from organization o join member m on m.organization_id=o.id join "user" u on u.id=m.user_id where u.email='${owner}'`) === "Umbrella Corp", "organization renamed");

// The only owner can't delete their account while others are on the team.
await t.goto("http://localhost:3000/account");
t.once("dialog", (d) => d.accept());
await t.locator("form", { hasText: "Delete my account" }).locator("input[name=password]").fill("new-password-456");
await t.getByRole("button", { name: "Delete my account" }).click();
await t.getByText(/only owner of a team/).waitFor();
ok(true, "sole owner can't delete their account and orphan the team");

// The member leaves, then deletes their account.
await m.goto("http://localhost:3000/team");
m.once("dialog", (d) => d.accept());
await m.getByRole("button", { name: "Leave organization" }).click();
await m.waitForURL(/onboarding|dashboard/);
ok(psql(`select count(*) from member m join "user" u on u.id=m.user_id where u.email='${mate}'`) === "0", "member left the organization");
await m.goto("http://localhost:3000/account");
m.once("dialog", (d) => d.accept());
await m.locator("form", { hasText: "Delete my account" }).locator("input[name=password]").fill("password123");
await m.getByRole("button", { name: "Delete my account" }).click();
await m.waitForURL("http://localhost:3000/");
ok(psql(`select count(*) from "user" where email='${mate}'`) === "0", "account deleted");

// Owner deletes the organization.
const orgId = psql(`select m.organization_id from member m join "user" u on u.id=m.user_id where u.email='${owner}'`);
await t.goto("http://localhost:3000/team");
await t.fill("input[name=confirm]", "Umbrella Corp");
await t.getByRole("button", { name: "Delete organization" }).click();
await t.waitForURL(/onboarding|dashboard/);
ok(psql(`select count(*) from organization where id='${orgId}'`) === "0" && psql(`select count(*) from project where organization_id='${orgId}'`) === "0", "organization deleted with its projects");

await browser.close();
console.log("ALL PASSED");
