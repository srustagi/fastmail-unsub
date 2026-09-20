import { describe, expect, it } from "vitest";
import { validateOneClickUrl } from "@/lib/url-safety";

describe("validateOneClickUrl", () => {
  it("accepts a normal HTTPS unsubscribe URL", () => {
    expect(
      validateOneClickUrl("https://mailer.example.com/unsubscribe?token=abc").href,
    ).toBe("https://mailer.example.com/unsubscribe?token=abc");
  });

  it.each([
    "http://mailer.example.com/unsubscribe",
    "https://localhost/unsubscribe",
    "https://127.0.0.1/unsubscribe",
    "https://10.0.0.1/unsubscribe",
    "https://192.168.1.1/unsubscribe",
    "https://user:password@example.com/unsubscribe",
    "https://example.com:8443/unsubscribe",
    "https://[::1]/unsubscribe",
  ])("rejects unsafe destination %s", (url) => {
    expect(() => validateOneClickUrl(url)).toThrow();
  });
});
