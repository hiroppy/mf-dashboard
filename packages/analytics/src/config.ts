import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

type Provider = "openai" | "anthropic" | "google" | "workers-ai";

const providers: Record<Provider, (model: string) => LanguageModel> = {
  openai: (model) => createOpenAI({ apiKey: process.env.AI_API_KEY })(model),
  anthropic: (model) => createAnthropic({ apiKey: process.env.AI_API_KEY })(model),
  google: (model) => createGoogleGenerativeAI({ apiKey: process.env.AI_API_KEY })(model),
  // Workers AI serves the Responses API only for GPT-OSS models and without streaming, so skip createOpenAI's default.
  "workers-ai": (model) => {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!accountId) {
      throw new Error("CLOUDFLARE_ACCOUNT_ID must be set when AI_PROVIDER is workers-ai");
    }
    return createOpenAI({
      apiKey: process.env.AI_API_KEY,
      baseURL: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`,
    }).chat(model);
  },
};

export function isLLMEnabled(): boolean {
  if (!(process.env.AI_PROVIDER && process.env.AI_MODEL && process.env.AI_API_KEY)) {
    return false;
  }
  return process.env.AI_PROVIDER !== "workers-ai" || !!process.env.CLOUDFLARE_ACCOUNT_ID;
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

  return providers[provider](model);
}
