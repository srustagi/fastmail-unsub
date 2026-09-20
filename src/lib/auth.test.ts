import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

const { testEnv } = vi.hoisted(() => ({
  testEnv: {} as Record<string, unknown>,
}));

vi.mock("cloudflare:workers", () => ({ env: testEnv }));

import { requireUserEmail } from "@/lib/auth";

describe("requireUserEmail", () => {
  let validToken: string;

  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "test-key";
    publicJwk.alg = "RS256";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ keys: [publicJwk] }, {
          headers: { "Cache-Control": "public, max-age=300" },
        }),
      ),
    );

    testEnv.ACCESS_TEAM_DOMAIN = "https://example.cloudflareaccess.com";
    testEnv.ACCESS_AUD = "test-audience";
    validToken = await new SignJWT({ email: "Person@Example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer("https://example.cloudflareaccess.com")
      .setAudience("test-audience")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  });

  it("accepts a valid Cloudflare Access JWT", async () => {
    const request = new Request("https://app.example.com/api/bootstrap", {
      headers: { "Cf-Access-Jwt-Assertion": validToken },
    });

    await expect(requireUserEmail(request)).resolves.toBe("person@example.com");
  });

  it("does not trust the unsigned email header", async () => {
    const request = new Request("https://app.example.com/api/bootstrap", {
      headers: { "Cf-Access-Authenticated-User-Email": "person@example.com" },
    });

    await expect(requireUserEmail(request)).rejects.toMatchObject({ status: 401 });
  });

  it("allows the configured local-only development identity", async () => {
    testEnv.DEV_USER_EMAIL = "Developer@Example.com";
    const request = new Request("http://localhost:3000/api/bootstrap");

    await expect(requireUserEmail(request)).resolves.toBe(
      "developer@example.com",
    );
    delete testEnv.DEV_USER_EMAIL;
  });
});
