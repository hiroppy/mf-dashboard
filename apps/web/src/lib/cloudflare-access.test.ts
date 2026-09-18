import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRemoteJWKSet: vi.fn<(url: URL) => string>(() => "jwks"),
  jwtVerify:
    vi.fn<
      (
        token: string,
        jwks: string,
        options: { audience: string; issuer: string },
      ) => Promise<{ payload: Record<string, never> }>
    >(),
}));

vi.mock("jose", () => mocks);

const { hasValidCloudflareAccess } = await import("./cloudflare-access");

function request(token?: string, url = "https://dashboard.example.com/api/chat"): Request {
  return new Request(url, {
    headers: token ? { "cf-access-jwt-assertion": token } : {},
  });
}

describe("hasValidCloudflareAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("CLOUDFLARE_ACCESS_TEAM_DOMAIN", "team.cloudflareaccess.com");
    vi.stubEnv("CLOUDFLARE_ACCESS_AUD", "application-audience");
    mocks.jwtVerify.mockResolvedValue({ payload: {} });
  });

  it("verifies the Access JWT signature, issuer, audience, and expiry", async () => {
    await expect(hasValidCloudflareAccess(request("access-token"))).resolves.toBe(true);

    expect(mocks.createRemoteJWKSet).toHaveBeenCalledWith(
      new URL("https://team.cloudflareaccess.com/cdn-cgi/access/certs"),
    );
    expect(mocks.jwtVerify).toHaveBeenCalledWith("access-token", "jwks", {
      audience: "application-audience",
      issuer: "https://team.cloudflareaccess.com",
    });
  });

  it("fails closed when configuration or the assertion is missing", async () => {
    await expect(hasValidCloudflareAccess(request())).resolves.toBe(false);
    vi.stubEnv("CLOUDFLARE_ACCESS_AUD", "");
    await expect(hasValidCloudflareAccess(request("access-token"))).resolves.toBe(false);
    expect(mocks.jwtVerify).not.toHaveBeenCalled();
  });

  it("rejects an invalid Access JWT", async () => {
    mocks.jwtVerify.mockRejectedValue(new Error("expired"));

    await expect(hasValidCloudflareAccess(request("access-token"))).resolves.toBe(false);
  });

  it("allows the explicit demo-data mode without Access", async () => {
    vi.stubEnv("DEMO_MODE", "true");

    await expect(hasValidCloudflareAccess(request())).resolves.toBe(true);
  });

  it.each(["http://localhost:3000/api/chat", "http://127.0.0.1:3000/api/chat"])(
    "allows an explicit loopback-only development session at %s",
    async (url) => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("ALLOW_LOCAL_AUTH_BYPASS", "true");

      await expect(hasValidCloudflareAccess(request(undefined, url))).resolves.toBe(true);
      expect(mocks.jwtVerify).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["production mode", "production", "true", "http://127.0.0.1:3000/api/chat"],
    ["a missing opt-in", "development", "", "http://127.0.0.1:3000/api/chat"],
    ["a non-loopback host", "development", "true", "http://192.0.2.10:3000/api/chat"],
  ])("does not bypass Access for %s", async (_case, nodeEnv, bypass, url) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("ALLOW_LOCAL_AUTH_BYPASS", bypass);

    await expect(hasValidCloudflareAccess(request(undefined, url))).resolves.toBe(false);
    expect(mocks.jwtVerify).not.toHaveBeenCalled();
  });
});
