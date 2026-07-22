import { afterEach, describe, expect, test } from "vitest";
import { getAIBackend, isLLMEnabled } from "./config.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("AI backend configuration", () => {
  test("uses the AI SDK backend by default", () => {
    delete process.env.AI_BACKEND;
    expect(getAIBackend()).toBe("ai-sdk");
  });

  test("enables Codex with a model and no API provider", () => {
    process.env.AI_BACKEND = "codex";
    process.env.AI_MODEL = "gpt-5.4";
    delete process.env.AI_PROVIDER;
    expect(isLLMEnabled()).toBe(true);
  });

  test("keeps AI SDK provider and model requirements", () => {
    process.env.AI_BACKEND = "ai-sdk";
    process.env.AI_MODEL = "gpt-5.4";
    delete process.env.AI_PROVIDER;
    expect(isLLMEnabled()).toBe(false);
  });

  test("rejects an unknown backend", () => {
    process.env.AI_BACKEND = "other";
    expect(() => getAIBackend()).toThrow("Unknown AI backend: other");
  });
});
