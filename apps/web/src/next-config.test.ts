import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

async function loadConfig(phase: string, env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  process.env = { ...originalEnv, ...env };
  const mod = await import("../next.config");
  return mod.default(phase);
}

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("next config", () => {
  it("excludes TypeScript route handlers from demo static export builds", async () => {
    const config = await loadConfig(PHASE_PRODUCTION_BUILD, { DEMO_MODE: "true" });

    expect(config.output).toBe("export");
    expect(config.pageExtensions).toEqual(["tsx"]);
    expect(config.env?.NEXT_PUBLIC_STATIC_DEMO_BUILD).toBe("true");
  });

  it("keeps TypeScript route handlers available for demo development", async () => {
    const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, { DEMO_MODE: "true" });

    expect(config.output).toBe("standalone");
    expect(config.pageExtensions).toEqual(["tsx", "ts"]);
    expect(config.env?.NEXT_PUBLIC_STATIC_DEMO_BUILD).toBe("false");
  });

  it("keeps TypeScript route handlers available for runtime server builds", async () => {
    const config = await loadConfig(PHASE_PRODUCTION_BUILD);

    expect(config.output).toBe("standalone");
    expect(config.outputFileTracingRoot).toBeDefined();
    expect(config.pageExtensions).toEqual(["tsx", "ts"]);
  });
});
