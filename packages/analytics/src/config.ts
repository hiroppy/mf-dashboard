import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

type Provider = "openai" | "anthropic" | "google";
export type AIBackend = "ai-sdk" | "codex";

const providers: Record<Provider, () => ReturnType<typeof createOpenAI>> = {
  openai: () => createOpenAI({ apiKey: process.env.AI_API_KEY }),
  anthropic: () =>
    createAnthropic({ apiKey: process.env.AI_API_KEY }) as unknown as ReturnType<
      typeof createOpenAI
    >,
  google: () =>
    createGoogleGenerativeAI({ apiKey: process.env.AI_API_KEY }) as unknown as ReturnType<
      typeof createOpenAI
    >,
};

export function isLLMEnabled(): boolean {
  const backend = getAIBackend();
  if (!process.env.AI_MODEL) return false;
  return backend === "codex" || !!process.env.AI_PROVIDER;
}

export function getAIBackend(): AIBackend {
  const backend = process.env.AI_BACKEND ?? "ai-sdk";
  if (backend !== "ai-sdk" && backend !== "codex") {
    throw new Error(`Unknown AI backend: ${backend}`);
  }
  return backend;
}

export function getModel() {
  const provider = process.env.AI_PROVIDER as Provider;
  const model = process.env.AI_MODEL;

  if (!provider || !model) {
    throw new Error("AI_PROVIDER and AI_MODEL must be set");
  }

  if (!providers[provider]) {
    throw new Error(`Unknown AI provider: ${provider}`);
  }

  return providers[provider]()(model);
}
