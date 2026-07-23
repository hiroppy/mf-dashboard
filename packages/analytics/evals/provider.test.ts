import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
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
              output: [
                {
                  type: "empty",
                  title: "データなし",
                  description: "条件に一致するデータがありません。",
                  prompts: ["別の期間を見る"],
                },
              ],
            },
          ],
        },
      ],
    }),
    getCurrentGroup: vi.fn<ProviderDependencies["getCurrentGroup"]>().mockResolvedValue({
      id: "0",
      name: "グループ選択なし",
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
  } as ProviderDependencies;
}

describe("toEvaluationOutput", () => {
  it("returns only final text, cards, and routes", () => {
    const response: ChatResponse = {
      text: "回答",
      steps: [
        {
          toolResults: [
            {
              toolName: "getFinanceDashboardRoute",
              output: { href: "/0/cf/2026-07" },
            },
            {
              toolName: "presentFinanceCards",
              output: [
                {
                  type: "action",
                  title: "詳細",
                  description: "内訳を確認できます。",
                  action: { label: "見る", href: "/0/cf/2026-07" },
                },
              ],
            },
          ],
        },
      ],
    };

    expect(toEvaluationOutput(response)).toEqual({
      text: "回答",
      cards: [
        {
          type: "action",
          title: "詳細",
          description: "内訳を確認できます。",
          action: { label: "見る", href: "/0/cf/2026-07" },
        },
      ],
      routes: ["/0/cf/2026-07"],
    });
  });

  it("requires exactly one card presentation", () => {
    expect(() => toEvaluationOutput({ text: "回答", steps: [] })).toThrow(
      "presentFinanceCards の成功結果は1件必要です",
    );
  });
});

describe("FinanceChatProvider", () => {
  it("calls finance chat with the fixed evaluation date", async () => {
    const dependencies = createDependencies();
    const provider = new FinanceChatProvider({}, dependencies);

    await expect(
      provider.callApi("今月どう？", {
        vars: { evaluationDate: "2026-07-31T03:00:00.000Z" },
      }),
    ).resolves.toMatchObject({ output: expect.any(String) });

    expect(dependencies.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "今月どう？",
        system: expect.stringContaining("現在日付は2026-07-31"),
      }),
    );
  });

  it("reports missing provider credentials", async () => {
    const provider = new FinanceChatProvider({}, createDependencies({ isLLMEnabled: () => false }));

    await expect(provider.callApi("今月どう？")).resolves.toEqual({
      error: "AI_PROVIDER、AI_MODEL、AI_API_KEY を設定してください。",
    });
  });

  it("reports an invalid database path", async () => {
    const provider = new FinanceChatProvider(
      {},
      createDependencies({ getDatabasePath: () => undefined }),
    );

    await expect(provider.callApi("今月どう？")).resolves.toEqual({
      error: "評価にはリポジトリの data/demo.db を DB_PATH に指定してください。",
    });
  });

  it("reports a missing demo database", async () => {
    const provider = new FinanceChatProvider(
      {},
      createDependencies({ isDatabaseAvailable: () => false }),
    );

    await expect(provider.callApi("今月どう？")).resolves.toEqual({
      error:
        "demo.db がありません。先に pnpm --filter @mf-dashboard/db build:demo --period=2026-07 を実行してください。",
    });
  });

  it("reports an invalid evaluation date", async () => {
    const provider = new FinanceChatProvider({}, createDependencies());

    await expect(
      provider.callApi("今月どう？", { vars: { evaluationDate: "not-a-date" } }),
    ).resolves.toEqual({
      error: "evaluationDate を ISO 8601 形式で指定してください。",
    });
  });
});
