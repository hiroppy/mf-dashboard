import { afterEach, describe, expect, it, vi } from "vitest";

const loadConfig = async () => {
  vi.resetModules();
  return (await import("../playwright.config")).default;
};

describe("Playwright config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses two workers in CI", async () => {
    vi.stubEnv("CI", "true");

    expect((await loadConfig()).workers).toBe(2);
  });

  it("uses Playwright's default worker count outside CI", async () => {
    vi.stubEnv("CI", "");

    expect((await loadConfig()).workers).toBeUndefined();
  });
});
