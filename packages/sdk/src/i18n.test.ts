import { afterEach, describe, expect, it } from "vitest";
import { setLanguage, t } from "./i18n";

describe("i18n", () => {
  afterEach(() => setLanguage("en"));

  it("fills in variables", () => {
    expect(t("progress", { title: "Get started", done: 1, total: 3 })).toBe("Get started · 1 of 3");
  });

  it("translates and falls back to English for unknown languages", () => {
    setLanguage("es");
    expect(t("allow")).toBe("Permitir");
    setLanguage("xx");
    expect(t("allow")).toBe("Allow");
  });
});
