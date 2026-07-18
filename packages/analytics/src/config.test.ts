import { afterEach, describe, expect, it } from "vitest";
import { isLLMEnabled } from "./config.js";

const originalEnv = { ...process.env };

describe("isLLMEnabled", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it.each(["AI_PROVIDER", "AI_MODEL", "AI_API_KEY"])("requires %s", (missingVariable) => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_MODEL = "test-model";
    process.env.AI_API_KEY = "test-api-key";
    delete process.env[missingVariable];

    expect(isLLMEnabled()).toBe(false);
  });

  it("is enabled when every variable is configured", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_MODEL = "test-model";
    process.env.AI_API_KEY = "test-api-key";

    expect(isLLMEnabled()).toBe(true);
  });
});
