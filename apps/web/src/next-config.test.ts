import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

async function loadConfig(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  process.env = { ...originalEnv, ...env };
  const mod = await import("../next.config");
  return mod.default;
}

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("next config", () => {
  it("excludes TypeScript route handlers from demo static export builds", async () => {
    const config = await loadConfig({
      DEMO_MODE: "true",
    });

    expect(config.output).toBe("export");
    expect(config.pageExtensions).toEqual(["tsx"]);
    expect(config.headers).toBeUndefined();
  });

  it("keeps TypeScript route handlers available for runtime server builds", async () => {
    const config = await loadConfig();

    expect(config.output).toBe("standalone");
    expect(config.outputFileTracingRoot).toBeDefined();
    expect(config.pageExtensions).toEqual(["tsx", "ts"]);
    await expect(config.headers?.()).resolves.toEqual([
      {
        source: "/((?!_next/static|_next/image|favicon.ico|logo.png|cry.png).*)",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "CDN-Cache-Control", value: "no-store" },
          { key: "Cloudflare-CDN-Cache-Control", value: "no-store" },
          { key: "Surrogate-Control", value: "no-store" },
          { key: "Pragma", value: "no-cache" },
          { key: "Vary", value: "Cookie" },
        ],
      },
    ]);
  });
});
