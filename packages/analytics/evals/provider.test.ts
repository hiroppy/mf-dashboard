import { describe, expect, it, vi } from "vitest";
import FinanceChatProvider, { toEvaluationOutput } from "./provider";

describe("FinanceChatProvider", () => {
  it("returns final text and presentation cards as JSON", async () => {
    const generate = vi
      .fn<(options: unknown) => Promise<unknown>>()
      .mockImplementation(async () => {
        expect(new Date().toISOString()).toBe("2026-07-31T03:00:00.000Z");
        return {
          text: "今月の結果です。",
          steps: [
            {
              toolResults: [
                { toolName: "getMonthlySummaryByMonth", output: { income: 1 } },
                { toolName: "presentFinanceCards", output: [{ type: "summary", amount: 1 }] },
              ],
            },
          ],
        };
      });
    const provider = new FinanceChatProvider({}, {
      generate,
      getDatabasePath: vi.fn<() => string>().mockReturnValue("../../data/demo.db"),
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
    expect(new Date().toISOString()).not.toBe("2026-07-31T03:00:00.000Z");
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
      getDatabasePath: vi.fn<() => string>().mockReturnValue("../../data/demo.db"),
      isDatabaseAvailable: vi.fn<() => boolean>().mockReturnValue(false),
    } as never);

    const response = await provider.callApi("今月どう？");

    expect(response.error).toContain("demo.db がありません");
    expect(response.error).toContain("build:demo");
  });

  it("rejects an unset or non-demo database path", async () => {
    for (const databasePath of [undefined, "../../data/moneyforward.db"]) {
      const provider = new FinanceChatProvider({}, {
        isLLMEnabled: vi.fn<() => boolean>().mockReturnValue(true),
        getDatabasePath: vi.fn<() => string | undefined>().mockReturnValue(databasePath),
      } as never);

      await expect(provider.callApi("今月どう？")).resolves.toEqual({
        error: "評価にはリポジトリの data/demo.db を DB_PATH に指定してください。",
      });
    }
  });
});

describe("toEvaluationOutput", () => {
  it("requires exactly one presentation result", () => {
    expect(() =>
      toEvaluationOutput({
        text: "回答",
        steps: [{ toolResults: [{ toolName: "searchTransactions", output: [{ amount: 1 }] }] }],
      }),
    ).toThrow("実際: 0件");

    expect(() =>
      toEvaluationOutput({
        text: "回答",
        steps: [
          {
            toolResults: [
              { toolName: "presentFinanceCards", output: [{ type: "summary" }] },
              { toolName: "presentFinanceCards", output: [{ type: "insight" }] },
            ],
          },
        ],
      }),
    ).toThrow("実際: 2件");
  });
});
