import { describe, expect, it, vi } from "vitest";
import FinanceChatProvider, { toEvaluationOutput } from "./provider";

describe("FinanceChatProvider", () => {
  it("returns final text and presentation cards as JSON", async () => {
    const generate = vi.fn<(options: unknown) => Promise<unknown>>().mockResolvedValue({
      text: "今月の結果です。",
      steps: [
        {
          toolResults: [
            { toolName: "getLatestMonthlySummary", output: { income: 1 } },
            { toolName: "presentFinanceCards", output: [{ type: "summary", amount: 1 }] },
          ],
        },
      ],
    });
    const provider = new FinanceChatProvider({}, {
      generate,
      getCurrentGroup: vi.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: "demo" }),
      getDb: vi.fn<() => object>().mockReturnValue({}),
      getModel: vi.fn<() => object>().mockReturnValue({}),
      isDatabaseAvailable: vi.fn<() => boolean>().mockReturnValue(true),
      isLLMEnabled: vi.fn<() => boolean>().mockReturnValue(true),
    } as never);

    const response = await provider.callApi("今月どう？", {
      vars: { evaluationDate: "2026-07-31T03:00:00.000Z" },
    });

    expect(JSON.parse(response.output!)).toEqual({
      text: "今月の結果です。",
      cards: [{ type: "summary", amount: 1 }],
    });
    expect(generate).toHaveBeenCalledOnce();
  });

  it("returns a clear error when provider settings are missing", async () => {
    const provider = new FinanceChatProvider({}, {
      isLLMEnabled: vi.fn<() => boolean>().mockReturnValue(false),
    } as never);

    await expect(provider.callApi("今月どう？")).resolves.toEqual({
      error: "AI_PROVIDER、AI_MODEL、AI_API_KEY を設定してください。",
    });
  });

  it("returns a clear error when demo.db is missing", async () => {
    const provider = new FinanceChatProvider({}, {
      isLLMEnabled: vi.fn<() => boolean>().mockReturnValue(true),
      isDatabaseAvailable: vi.fn<() => boolean>().mockReturnValue(false),
    } as never);

    const response = await provider.callApi("今月どう？");

    expect(response.error).toContain("demo.db がありません");
    expect(response.error).toContain("build:demo");
  });
});

describe("toEvaluationOutput", () => {
  it("ignores non-presentation tool results", () => {
    expect(
      toEvaluationOutput({
        text: "回答",
        steps: [{ toolResults: [{ toolName: "searchTransactions", output: [{ amount: 1 }] }] }],
      }),
    ).toEqual({ text: "回答", cards: [] });
  });
});
