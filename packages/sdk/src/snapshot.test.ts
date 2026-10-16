// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { maskPII } from "./redact";
import { takeSnapshot } from "./snapshot";

const masking = { maskPII: true, selectors: [".secret"] };

describe("maskPII", () => {
  it("masks emails, phone and card numbers but not dates or amounts", () => {
    expect(maskPII("mail jo@acme.com or call (555) 123-4567")).toBe("mail [email] or call [phone]");
    expect(maskPII("card 4242 4242 4242 4242 ok")).toBe("card [card number] ok");
    expect(maskPII("on 2026-10-12 we made $18,200 from 342 signups")).toBe("on 2026-10-12 we made $18,200 from 342 signups");
  });
});

describe("takeSnapshot", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <h1>Settings</h1>
      <nav><a href="/reports" class="active">Reports</a></nav>
      <button aria-label="Export report">⬇</button>
      <label>Email <input name="email" value="jordan@acme.test"></label>
      <label for="pw">Password</label><input id="pw" type="password" value="hunter2">
      <label>Card <input autocomplete="cc-number" value="4242424242424242"></label>
      <label>Timezone <select><option>UTC</option><option selected>Europe/London</option></select></label>
      <div class="secret">Account balance 12,000</div>
      <div data-clicky-mask>Private note</div>
      <div data-clicky-ignore><button>Hidden admin</button><p>Internal text</p></div>
      <button style="display:none">Invisible</button>
      <p>Contact support at help@acme.test</p>`;
  });

  it("lists interactive elements with refs, names and states", () => {
    const { text, refs } = takeSnapshot(masking);
    expect(text).toContain('[e1] link "Reports" (current)');
    expect(text).toContain('[e2] button "Export report"');
    expect(text).toMatch(/\[e\d+\] select "Timezone" = "Europe\/London" options: UTC \| Europe\/London/);
    expect(refs.get("e2")?.getAttribute("aria-label")).toBe("Export report");
    expect(text).toContain('h1 "Settings"');
  });

  it("never includes secrets", () => {
    const { text } = takeSnapshot(masking);
    for (const secret of ["hunter2", "4242424242424242", "jordan@acme.test", "12,000", "Private note", "help@acme.test"]) {
      expect(text).not.toContain(secret);
    }
    expect(text).toMatch(/textbox "Password" = \[masked\]/);
    expect(text).toMatch(/textbox "Email" = "\[email\]"/);
  });

  it("skips ignored and invisible elements", () => {
    const { text } = takeSnapshot(masking);
    expect(text).not.toContain("Hidden admin");
    expect(text).not.toContain("Internal text");
    expect(text).not.toContain("Invisible");
  });

  it("can leave PII unmasked when the project turns masking off", () => {
    const { text } = takeSnapshot({ maskPII: false, selectors: [] });
    expect(text).toContain("jordan@acme.test");
    expect(text).not.toContain("hunter2");
  });
});
