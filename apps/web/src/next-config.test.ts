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
  it("excludes TypeScript route handlers from GitHub Pages static export builds", async () => {
    const config = await loadConfig({
      GITHUB_PAGES: "true",
      NEXT_PUBLIC_GITHUB_REPO: "mf-dashboard",
    });

    expect(config.output).toBe("export");
    expect(config.pageExtensions).toEqual(["tsx"]);
  });

  it("keeps TypeScript route handlers available for runtime server builds", async () => {
    const config = await loadConfig();

    expect(config.output).toBeUndefined();
    expect(config.pageExtensions).toEqual(["tsx", "ts"]);
  });
});
