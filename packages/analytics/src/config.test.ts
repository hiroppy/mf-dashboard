import { afterEach, describe, expect, test } from "vitest";
import { getAIBackend, isLLMEnabled } from "./config.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("AI backend config", () => {
  test("AI SDK is the default backend", () => {
    delete process.env.AI_BACKEND;

    expect(getAIBackend()).toBe("ai-sdk");
  });

  test("AI SDK requires a provider and model", () => {
    process.env.AI_BACKEND = "ai-sdk";
    process.env.AI_PROVIDER = "openai";
    process.env.AI_MODEL = "test-model";

    expect(isLLMEnabled()).toBe(true);

    delete process.env.AI_MODEL;
    expect(isLLMEnabled()).toBe(false);
  });

  test("app-server enables LLM without AI SDK credentials", () => {
    process.env.AI_BACKEND = "codex-app-server";
    delete process.env.AI_PROVIDER;
    delete process.env.AI_MODEL;

    expect(isLLMEnabled()).toBe(true);
  });

  test("unknown backends fail explicitly", () => {
    process.env.AI_BACKEND = "unknown";

    expect(() => getAIBackend()).toThrow("Unknown AI backend: unknown");
  });
});
