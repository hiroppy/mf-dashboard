import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

type Provider = "openai" | "anthropic" | "google";

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
  return !!(process.env.AI_PROVIDER && process.env.AI_MODEL);
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
