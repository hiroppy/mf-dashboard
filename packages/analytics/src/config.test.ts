import { generateText } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getModel, isLLMEnabled } from "./config.js";

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

describe("workers-ai provider", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  function configure(provider: string, accountId?: string) {
    process.env.AI_PROVIDER = provider;
    process.env.AI_MODEL = "@cf/meta/llama-test";
    process.env.AI_API_KEY = "test-api-key";
    if (accountId === undefined) {
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
    } else {
      process.env.CLOUDFLARE_ACCOUNT_ID = accountId;
    }
  }

  it("is disabled without CLOUDFLARE_ACCOUNT_ID", () => {
    configure("workers-ai");

    expect(isLLMEnabled()).toBe(false);
  });

  it("is enabled with CLOUDFLARE_ACCOUNT_ID", () => {
    configure("workers-ai", "test-account");

    expect(isLLMEnabled()).toBe(true);
  });

  it("does not require CLOUDFLARE_ACCOUNT_ID for openai", () => {
    configure("openai");

    expect(isLLMEnabled()).toBe(true);
  });

  it("fails to build a model without CLOUDFLARE_ACCOUNT_ID", () => {
    configure("workers-ai");

    expect(() => getModel()).toThrow(/CLOUDFLARE_ACCOUNT_ID/);
  });

  it("sends chat completions to the account endpoint with the API token", async () => {
    configure("workers-ai", "test-account");
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            id: "chatcmpl-test",
            object: "chat.completion",
            created: 0,
            model: "@cf/meta/llama-test",
            choices: [
              { index: 0, message: { role: "assistant", content: "hello" }, finish_reason: "stop" },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateText({ model: getModel(), prompt: "hi" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/test-account/ai/v1/chat/completions",
    );
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-api-key");
    expect(result.text).toBe("hello");
  });
});
