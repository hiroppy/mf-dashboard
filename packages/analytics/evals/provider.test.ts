import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FinanceChatProvider, {
  type ChatResponse,
  type ProviderDependencies,
  toEvaluationOutput,
} from "./provider";

const demoDatabasePath = resolve(import.meta.dirname, "../../../data/demo.db");

function createDependencies(overrides: Partial<ProviderDependencies> = {}): ProviderDependencies {
  return {
    generate: vi.fn<ProviderDependencies["generate"]>().mockResolvedValue({
      text: "回答",
      steps: [
        {
          toolResults: [
            {
              toolName: "presentFinanceCards",
              output: [{ type: "empty", title: "データなし", prompts: ["別の期間を見る"] }],
            },
          ],
        },
      ],
    }),
    getCurrentGroup: vi.fn<ProviderDependencies["getCurrentGroup"]>().mockResolvedValue({
      id: "test-group",
      name: "Test Group",
      isCurrent: true,
      lastScrapedAt: null,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    }),
    getDatabasePath: () => demoDatabasePath,
    getDb: vi
      .fn<ProviderDependencies["getDb"]>()
      .mockReturnValue({} as ReturnType<ProviderDependencies["getDb"]>),
    getModel: vi
      .fn<ProviderDependencies["getModel"]>()
      .mockReturnValue({} as ReturnType<ProviderDependencies["getModel"]>),
    isDatabaseAvailable: () => true,
    isLLMEnabled: () => true,
    ...overrides,
  } as unknown as ProviderDependencies;
}

describe("toEvaluationOutput", () => {
  it("keeps only final text and presented cards", () => {
    const response: ChatResponse = {
      text: "回答",
      steps: [
        {
          toolResults: [
            { toolName: "getMonthlySummaryByMonth", output: { income: 100 } },
            { toolName: "presentFinanceCards", output: [{ type: "summary" }] },
          ],
        },
      ],
    };

    expect(toEvaluationOutput(response)).toEqual({
      text: "回答",
      cards: [{ type: "summary" }],
    });
  });

  it("requires exactly one card presentation", () => {
    expect(() => toEvaluationOutput({ text: "回答", steps: [] })).toThrow(
      "presentFinanceCards の成功結果は1件必要です",
    );
  });
});

describe("FinanceChatProvider", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("runs the finance chat with the evaluation date", async () => {
    const providerDependencies = createDependencies();
    const provider = new FinanceChatProvider({ id: "test-provider" }, providerDependencies);

    const result = await provider.callApi("今月どう？", {
      vars: { evaluationDate: "2026-07-31T03:00:00.000Z" },
    });

    expect(provider.id()).toBe("test-provider");
    expect(result).toHaveProperty("output");
    expect(providerDependencies.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "今月どう？",
        system: expect.stringContaining("現在日付は2026-07-31（Asia/Tokyo）"),
      }),
    );
  });

  it("explains missing model configuration", async () => {
    const provider = new FinanceChatProvider({}, createDependencies({ isLLMEnabled: () => false }));

    await expect(
      provider.callApi("質問", { vars: { evaluationDate: "2026-07-31" } }),
    ).resolves.toEqual({ error: "AI_PROVIDER、AI_MODEL、AI_API_KEY を設定してください。" });
  });

  it("rejects databases other than the demo fixture", async () => {
    const provider = new FinanceChatProvider(
      {},
      createDependencies({ getDatabasePath: () => "../../data/moneyforward.db" }),
    );

    const result = await provider.callApi("質問", { vars: { evaluationDate: "2026-07-31" } });
    expect(result).toEqual({
      error: "評価にはリポジトリの data/demo.db を DB_PATH に指定してください。",
    });
  });

  it("explains a missing demo fixture", async () => {
    const provider = new FinanceChatProvider(
      {},
      createDependencies({ isDatabaseAvailable: () => false }),
    );

    const result = await provider.callApi("質問", { vars: { evaluationDate: "2026-07-31" } });
    expect(result).toEqual({
      error:
        "demo.db がありません。先に pnpm --filter @mf-dashboard/db build:demo を実行してください。",
    });
  });

  it("requires a valid evaluation date", async () => {
    const provider = new FinanceChatProvider({}, createDependencies());

    await expect(provider.callApi("質問")).resolves.toEqual({
      error: "evaluationDate を ISO 8601 形式で指定してください。",
    });
  });
});
