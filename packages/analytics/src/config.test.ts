import { afterEach, describe, expect, it } from "vitest";
import { isLLMEnabled, isTypeSafeCategorizationEnabled } from "./config.js";

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

describe("isTypeSafeCategorizationEnabled", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it.each(["CATEGORIZATION_PROVIDER", "TYPESAFE_API_KEY"])("requires %s", (missingVariable) => {
    process.env.CATEGORIZATION_PROVIDER = "typesafe";
    process.env.TYPESAFE_API_KEY = "test-typesafe-key";
    delete process.env[missingVariable];

    expect(isTypeSafeCategorizationEnabled()).toBe(false);
  });

  it("is enabled when CATEGORIZATION_PROVIDER=typesafe and TYPESAFE_API_KEY are set", () => {
    process.env.CATEGORIZATION_PROVIDER = "typesafe";
    process.env.TYPESAFE_API_KEY = "test-typesafe-key";

    expect(isTypeSafeCategorizationEnabled()).toBe(true);
  });

  it("is disabled when CATEGORIZATION_PROVIDER is a different value", () => {
    process.env.CATEGORIZATION_PROVIDER = "openai";
    process.env.TYPESAFE_API_KEY = "test-typesafe-key";

    expect(isTypeSafeCategorizationEnabled()).toBe(false);
  });
});
