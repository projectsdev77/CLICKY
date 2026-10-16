import { describe, expect, it } from "vitest";
import { defaultProjectSettings, parseProjectSettings } from "./settings";
import { generatePublicKey, isPublicKey } from "./keys";

describe("project settings", () => {
  it("fills defaults", () => {
    const s = defaultProjectSettings();
    expect(s.appearance.assistantName).toBe("Clicky");
    expect(s.behavior.mode).toBe("agent");
    expect(s.behavior.voiceEnabled).toBe(true);
    expect(s.masking.maskPII).toBe(true);
  });

  it("keeps valid partial settings and defaults the rest", () => {
    const s = parseProjectSettings({ appearance: { brandColor: "#112233" } });
    expect(s.appearance.brandColor).toBe("#112233");
    expect(s.appearance.assistantName).toBe("Clicky");
  });

  it("falls back to defaults on invalid input", () => {
    expect(parseProjectSettings({ appearance: { brandColor: "red" } })).toEqual(defaultProjectSettings());
    expect(parseProjectSettings(null)).toEqual(defaultProjectSettings());
  });
});

describe("public keys", () => {
  it("generates valid, unique keys", () => {
    const a = generatePublicKey();
    expect(isPublicKey(a)).toBe(true);
    expect(a).not.toBe(generatePublicKey());
    expect(isPublicKey("pk_short")).toBe(false);
  });
});
