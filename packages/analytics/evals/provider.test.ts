import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FinanceChatProvider, {
  type ChatResponse,
  type ProviderDependencies,
  isDemoDatabasePath,
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
    isDemoDatabasePath: () => true,
    isDemoFixtureDatabase: vi
      .fn<ProviderDependencies["isDemoFixtureDatabase"]>()
      .mockResolvedValue(true),
    isLLMEnabled: () => true,
    ...overrides,
  } as unknown as ProviderDependencies;
}

describe("toEvaluationOutput", () => {
  it("keeps final output without retroactively synthesizing ordered text evidence", () => {
    const response: ChatResponse = {
      text: "回答",
      steps: [
        {
          toolResults: [
            {
              toolName: "getMonthlySummaryByMonth",
              input: { month: "2026-07" },
              output: { income: 100 },
            },
          ],
        },
        {
          toolResults: [{ toolName: "presentFinanceCards", output: [{ type: "summary" }] }],
        },
      ],
    };

    expect(toEvaluationOutput(response, "test-group")).toEqual({
      allowedHrefs: [],
      dataToolResults: [
        {
          toolName: "getMonthlySummaryByMonth",
          input: { month: "2026-07" },
          output: { income: 100 },
        },
      ],
      text: "回答",
      textEvidence: [],
      unauthorizedLinks: [],
      cards: [{ type: "summary" }],
    });
  });

  it("does not ground cards with data fetched after presentation", () => {
    const response: ChatResponse = {
      text: "回答",
      steps: [
        {
          toolResults: [{ toolName: "presentFinanceCards", output: [{ type: "summary" }] }],
        },
        {
          toolResults: [{ toolName: "getMonthlySummaryByMonth", output: { income: 100 } }],
        },
      ],
    };

    expect(toEvaluationOutput(response, "test-group").dataToolResults).toEqual([]);
  });

  it("requires exactly one card presentation", () => {
    expect(() => toEvaluationOutput({ text: "回答", steps: [] }, "test-group")).toThrow(
      "presentFinanceCards の成功結果は1件必要です",
    );
  });

  it("sanitizes text with routes returned by the navigation tool", () => {
    const response: ChatResponse = {
      text: "[詳細](https://example.com/test-group/cf/2026-07) [外部](https://example.com)",
      steps: [
        {
          toolResults: [
            {
              toolName: "getFinanceDashboardRoute",
              output: { href: "/test-group/cf/2026-07" },
            },
          ],
        },
        {
          toolResults: [{ toolName: "presentFinanceCards", output: [{ type: "summary" }] }],
        },
      ],
    };

    expect(toEvaluationOutput(response, "test-group")).toMatchObject({
      allowedHrefs: ["/test-group/cf/2026-07"],
      text: "[詳細](/test-group/cf/2026-07) 外部",
      unauthorizedLinks: ["https://example.com/test-group/cf/2026-07", "https://example.com"],
    });
  });

  it("rejects an external origin even when its pathname matches an allowed route", () => {
    const response: ChatResponse = {
      text: "回答",
      steps: [
        {
          toolResults: [
            {
              toolName: "getFinanceDashboardRoute",
              output: { href: "/test-group/cf/2026-07" },
            },
          ],
        },
        {
          text: "[詳細](https://attacker.example/test-group/cf/2026-07)",
          toolResults: [{ toolName: "presentFinanceCards", output: [{ type: "summary" }] }],
        },
      ],
    };

    expect(toEvaluationOutput(response, "test-group")).toMatchObject({
      text: "[詳細](/test-group/cf/2026-07)",
      unauthorizedLinks: ["https://attacker.example/test-group/cf/2026-07"],
    });
  });

  it("records and removes a Unicode-host URL before evaluation", () => {
    const response: ChatResponse = {
      text: "https://例.exampleです。",
      steps: [
        {
          text: "https://例.exampleです。",
          toolResults: [{ toolName: "presentFinanceCards", output: [{ type: "summary" }] }],
        },
      ],
    };

    expect(toEvaluationOutput(response, "test-group")).toMatchObject({
      text: "です。",
      unauthorizedLinks: ["https://例.example"],
    });
  });

  it("records and removes a Markdown image destination before evaluation", () => {
    const text = "![x](javascript:alert(1))";
    const response: ChatResponse = {
      text,
      steps: [
        {
          text,
          toolResults: [{ toolName: "presentFinanceCards", output: [{ type: "summary" }] }],
        },
      ],
    };

    expect(toEvaluationOutput(response, "test-group")).toMatchObject({
      text: "x",
      unauthorizedLinks: ["javascript:alert(1)"],
    });
  });

  it("records and removes a raw HTML link before evaluation", () => {
    const response: ChatResponse = {
      text: '<a href="mailto:evil@example.com">メール</a>',
      steps: [
        {
          text: '<a href="mailto:evil@example.com">メール</a>',
          toolResults: [{ toolName: "presentFinanceCards", output: [{ type: "summary" }] }],
        },
      ],
    };

    expect(toEvaluationOutput(response, "test-group")).toMatchObject({
      text: "メール",
      unauthorizedLinks: ["mailto:evil@example.com"],
    });
  });

  it.each([
    ['<a href="mailto:evil@example.com">メール', "mailto:evil@example.com"],
    ['<a href="javascript:alert(1)"/>メール', "javascript:alert(1)"],
  ])("records and removes a malformed raw HTML link: %s", (text, unauthorizedLink) => {
    const response: ChatResponse = {
      text,
      steps: [
        {
          text,
          toolResults: [{ toolName: "presentFinanceCards", output: [{ type: "summary" }] }],
        },
      ],
    };

    expect(toEvaluationOutput(response, "test-group")).toMatchObject({
      text: "メール",
      unauthorizedLinks: [unauthorizedLink],
    });
  });

  it("records and removes a non-route reference-style link before evaluation", () => {
    const response: ChatResponse = {
      text: "[メール][ref]\n\n[ref]: mailto:evil@example.com",
      steps: [
        {
          text: "[メール][ref]\n\n[ref]: mailto:evil@example.com",
          toolResults: [{ toolName: "presentFinanceCards", output: [{ type: "summary" }] }],
        },
      ],
    };

    expect(toEvaluationOutput(response, "test-group")).toMatchObject({
      text: "メール\n\n",
      unauthorizedLinks: ["mailto:evil@example.com"],
    });
  });

  it("records a bare unauthorized URL before sanitizing visible text", () => {
    const response: ChatResponse = {
      text: "https://evil.example",
      steps: [
        {
          text: "https://evil.example",
          toolResults: [{ toolName: "presentFinanceCards", output: [{ type: "summary" }] }],
        },
      ],
    };

    expect(toEvaluationOutput(response, "test-group")).toMatchObject({
      text: "",
      unauthorizedLinks: ["https://evil.example"],
    });
  });

  it("records unauthorized links from every visible card string", () => {
    const response: ChatResponse = {
      text: "回答",
      steps: [
        {
          text: "回答",
          toolResults: [
            {
              toolName: "presentFinanceCards",
              output: [
                {
                  type: "insight",
                  title: "www.attacker.example",
                  description: "user@attacker.example",
                  href: "https://evil.example",
                },
              ],
            },
          ],
        },
      ],
    };

    expect(toEvaluationOutput(response, "test-group").unauthorizedLinks).toEqual(
      expect.arrayContaining([
        "www.attacker.example",
        "mailto:user@attacker.example",
        "https://evil.example",
      ]),
    );
  });

  it("records card href fields that were not returned before presentation", () => {
    const response: ChatResponse = {
      text: "回答",
      steps: [
        {
          toolResults: [
            {
              toolName: "presentFinanceCards",
              output: [
                {
                  type: "insight",
                  title: "確認",
                  href: "/other-group/cf/2026-07",
                  action: { label: "詳細", href: "/test-group/bs" },
                },
              ],
            },
          ],
        },
      ],
    };

    expect(toEvaluationOutput(response, "test-group").unauthorizedLinks).toEqual([
      "/other-group/cf/2026-07",
      "/test-group/bs",
    ]);
  });

  it("keeps visible text from every generation step in order", () => {
    const response: ChatResponse = {
      text: "最終回答",
      steps: [
        { text: "途中回答。", toolResults: [] },
        {
          text: "最終回答",
          toolResults: [{ toolName: "presentFinanceCards", output: [{ type: "summary" }] }],
        },
      ],
    };

    expect(toEvaluationOutput(response, "test-group").text).toBe("途中回答。最終回答");
  });

  it("snapshots data evidence before each visible text fragment", () => {
    const response: ChatResponse = {
      text: "収入は313,235円です。",
      steps: [
        { text: "収入は313,235円です。", toolResults: [] },
        {
          toolResults: [
            {
              toolName: "getMonthlySummaryByMonth",
              input: { month: "2026-07" },
              output: { totalIncome: 313235 },
            },
          ],
        },
        {
          toolResults: [{ toolName: "presentFinanceCards", output: [{ type: "summary" }] }],
        },
      ],
    };

    expect(toEvaluationOutput(response, "test-group").textEvidence).toEqual([
      { text: "収入は313,235円です。", allowedHrefs: [], dataToolResults: [] },
    ]);
  });

  it("does not allow a route that is returned after visible text", () => {
    const response: ChatResponse = {
      text: "最終回答",
      steps: [
        { text: "[詳細](/test-group/cf/2026-07)", toolResults: [] },
        {
          text: "",
          toolResults: [
            {
              toolName: "getFinanceDashboardRoute",
              output: { href: "/test-group/cf/2026-07" },
            },
            { toolName: "presentFinanceCards", output: [{ type: "summary" }] },
          ],
        },
      ],
    };

    expect(toEvaluationOutput(response, "test-group").text).toBe("詳細");
    expect(toEvaluationOutput(response, "test-group").textEvidence[0]).toMatchObject({
      allowedHrefs: [],
    });
  });

  it("does not prove a card route returned after card presentation", () => {
    const response: ChatResponse = {
      text: "回答",
      steps: [
        {
          toolResults: [
            {
              toolName: "presentFinanceCards",
              output: [{ type: "summary", href: "/test-group/cf/2026-07" }],
            },
          ],
        },
        {
          toolResults: [
            {
              toolName: "getFinanceDashboardRoute",
              output: { href: "/test-group/cf/2026-07" },
            },
          ],
        },
      ],
    };

    expect(toEvaluationOutput(response, "test-group").allowedHrefs).toEqual([]);
  });

  it("does not prove a card route returned in the presentation step", () => {
    const response: ChatResponse = {
      text: "回答",
      steps: [
        {
          toolResults: [
            {
              toolName: "getFinanceDashboardRoute",
              output: { href: "/test-group/cf/2026-07" },
            },
            {
              toolName: "presentFinanceCards",
              output: [{ type: "summary", href: "/test-group/cf/2026-07" }],
            },
          ],
        },
      ],
    };

    expect(toEvaluationOutput(response, "test-group").allowedHrefs).toEqual([]);
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

  it("applies the evaluation date to date-sensitive tools and restores the clock", async () => {
    const realNow = Date.now();
    const providerDependencies = createDependencies({
      generate: vi.fn<ProviderDependencies["generate"]>().mockImplementation(async () => {
        expect(new Date().toISOString()).toBe("2026-07-31T03:00:00.000Z");
        return {
          text: "回答",
          steps: [
            {
              toolResults: [{ toolName: "presentFinanceCards", output: [{ type: "summary" }] }],
            },
          ],
        };
      }),
    });
    const provider = new FinanceChatProvider({}, providerDependencies);

    await provider.callApi("質問", {
      vars: { evaluationDate: "2026-07-31T03:00:00.000Z" },
    });

    expect(Math.abs(Date.now() - realNow)).toBeLessThan(1_000);
    expect(new Date().toISOString()).not.toBe("2026-07-31T03:00:00.000Z");
  });

  it("restores the clock when generation fails", async () => {
    const realNow = Date.now();
    const providerDependencies = createDependencies({
      generate: vi.fn<ProviderDependencies["generate"]>().mockImplementation(async () => {
        expect(new Date().toISOString()).toBe("2026-07-31T03:00:00.000Z");
        throw new Error("generation failed");
      }),
    });
    const provider = new FinanceChatProvider({}, providerDependencies);

    await expect(
      provider.callApi("質問", {
        vars: { evaluationDate: "2026-07-31T03:00:00.000Z" },
      }),
    ).resolves.toEqual({ error: "generation failed" });

    expect(Math.abs(Date.now() - realNow)).toBeLessThan(1_000);
    expect(new Date().toISOString()).not.toBe("2026-07-31T03:00:00.000Z");
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
      createDependencies({
        getDatabasePath: () => "../../data/moneyforward.db",
        isDemoDatabasePath: () => false,
      }),
    );

    const result = await provider.callApi("質問", { vars: { evaluationDate: "2026-07-31" } });
    expect(result).toEqual({
      error: "評価にはリポジトリの data/demo.db を DB_PATH に指定してください。",
    });
  });

  it("rejects a demo database path that fails canonical file validation", async () => {
    const provider = new FinanceChatProvider(
      {},
      createDependencies({ isDemoDatabasePath: () => false }),
    );

    const result = await provider.callApi("質問", { vars: { evaluationDate: "2026-07-31" } });
    expect(result).toEqual({
      error: "評価には通常ファイルの data/demo.db を DB_PATH に指定してください。",
    });
  });

  it("rejects a canonical demo path whose fixture contents do not match", async () => {
    const generate = vi.fn<ProviderDependencies["generate"]>();
    const provider = new FinanceChatProvider(
      {},
      createDependencies({
        generate,
        getCurrentGroup: vi.fn<ProviderDependencies["getCurrentGroup"]>().mockResolvedValue({
          id: "0",
          name: "グループ選択なし",
          isCurrent: true,
          lastScrapedAt: null,
          createdAt: "2026-07-24T00:00:00.000Z",
          updatedAt: "2026-07-24T00:00:00.000Z",
        }),
        isDemoFixtureDatabase: vi
          .fn<ProviderDependencies["isDemoFixtureDatabase"]>()
          .mockResolvedValue(false),
      }),
    );

    await expect(
      provider.callApi("質問", { vars: { evaluationDate: "2026-07-31T03:00:00.000Z" } }),
    ).resolves.toEqual({
      error:
        "demo.db の内容が評価fixtureと一致しません。pnpm --filter @mf-dashboard/db build:demo --period=2026-07 で再生成してください。",
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects a symlink to the demo database", () => {
    const temporaryDirectory = mkdtempSync(join(import.meta.dirname, ".provider-test-"));
    const symlinkPath = join(temporaryDirectory, "demo.db");

    try {
      symlinkSync(demoDatabasePath, symlinkPath);
      expect(isDemoDatabasePath(symlinkPath)).toBe(false);
    } finally {
      rmSync(temporaryDirectory, { recursive: true });
    }
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

  it.each([undefined, "1", "2026-02-30T00:00:00.000Z"])(
    "requires a valid ISO evaluation date: %s",
    async (evaluationDate) => {
      const provider = new FinanceChatProvider({}, createDependencies());

      await expect(provider.callApi("質問", { vars: { evaluationDate } })).resolves.toEqual({
        error: "evaluationDate を ISO 8601 形式で指定してください。",
      });
    },
  );
});
