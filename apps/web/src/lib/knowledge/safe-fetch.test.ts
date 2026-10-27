import { describe, expect, it } from "vitest";
import { safeFetchHtml } from "./safe-fetch";

describe("safeFetchHtml", () => {
  it.each(["http://127.0.0.1/", "http://localhost:3000/", "http://10.0.0.5/", "http://169.254.169.254/latest/meta-data/", "file:///etc/passwd"])(
    "refuses %s",
    async (url) => {
      await expect(safeFetchHtml(url)).rejects.toThrow();
    },
  );
});
