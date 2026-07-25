import type { Db } from "@mf-dashboard/db";
import { describe, expect, it, vi } from "vitest";
import FinanceChatProvider, {
  type ChatResponse,
  type ProviderDependencies,
  toEvaluationOutput,
} from "./provider";

function createDependencies(overrides: Partial<ProviderDependencies> = {}): ProviderDependencies {
  return {
    canonicalizeDatabasePath: (path) => path,
    closeDb: vi.fn<() => void>(),
    generate: vi.fn<ProviderDependencies["generate"]>().mockResolvedValue({
      text: "回答",
      steps: [],
    }),
    getCurrentGroup: vi
      .fn<ProviderDependencies["getCurrentGroup"]>()
      .mockResolvedValue({ id: "0" }),
    getDatabasePath: () => "/isolated/demo.db",
    getDemoDatabasePath: () => "/isolated/demo.db",
    getDb: vi.fn<ProviderDependencies["getDb"]>().mockReturnValue({} as Db),
    getModel: vi
      .fn<ProviderDependencies["getModel"]>()
      .mockReturnValue({} as ReturnType<ProviderDependencies["getModel"]>),
    isDatabaseAvailable: () => true,
    isLLMEnabled: () => true,
    ...overrides,
  };
}

describe("toEvaluationOutput", () => {
  it("separates charts, route tool results, and Markdown links", () => {
    const response: ChatResponse = {
      text: "[2026年7月の収支を確認](/0/cf/2026-07)",
      steps: [
        {
          toolCalls: [
            {
              toolCallId: "query-1",
              toolName: "queryDatabase",
              input: { sql: "SELECT amount FROM transactions" },
            },
            {
              toolCallId: "route-1",
              toolName: "getFinanceDashboardRoute",
              input: { page: "cashFlow", month: "2026-07" },
            },
            {
              toolCallId: "chart-1",
              toolName: "presentChart",
              input: { title: "食費" },
            },
          ],
          toolResults: [
            {
              toolCallId: "query-1",
              toolName: "queryDatabase",
              output: {
                columns: ["amount"],
                rowCount: 1,
                rows: [{ amount: 24_833 }],
                truncated: false,
              },
            },
            {
              toolCallId: "route-1",
              toolName: "getFinanceDashboardRoute",
              output: { href: "/0/cf/2026-07" },
            },
            {
              toolCallId: "chart-1",
              toolName: "presentChart",
              output: {
                title: "食費",
                chartType: "pie",
                unit: "currency",
                series: [{ name: "支出", amountType: "expense" }],
                data: [{ label: "食料品", values: [24833] }],
              },
            },
          ],
        },
      ],
    };

    expect(toEvaluationOutput(response)).toEqual({
      text: response.text,
      charts: [
        {
          title: "食費",
          chartType: "pie",
          unit: "currency",
          series: [{ name: "支出", amountType: "expense" }],
          data: [{ label: "食料品", values: [24833] }],
        },
      ],
      toolTrace: [
        {
          input: { sql: "SELECT amount FROM transactions" },
          output: {
            columns: ["amount"],
            rowCount: 1,
            rows: [{ amount: 24_833 }],
            truncated: false,
          },
          succeeded: true,
          toolName: "queryDatabase",
        },
        {
          input: { page: "cashFlow", month: "2026-07" },
          output: { href: "/0/cf/2026-07" },
          succeeded: true,
          toolName: "getFinanceDashboardRoute",
        },
        {
          input: { title: "食費" },
          output: {
            title: "食費",
            chartType: "pie",
            unit: "currency",
            series: [{ name: "支出", amountType: "expense" }],
            data: [{ label: "食料品", values: [24833] }],
          },
          succeeded: true,
          toolName: "presentChart",
        },
      ],
      toolRoutes: ["/0/cf/2026-07"],
      textLinks: ["/0/cf/2026-07"],
    });
  });

  it("does not treat a model-authored link as a route tool result", () => {
    expect(
      toEvaluationOutput({
        text: "[収支を確認](/0/cf/2026-07)",
        steps: [],
      }),
    ).toEqual({
      text: "[収支を確認](/0/cf/2026-07)",
      charts: [],
      toolTrace: [],
      toolRoutes: [],
      textLinks: ["/0/cf/2026-07"],
    });
  });

  it.each([
    ["https://evil.example/path", "https://evil.example/path"],
    ["<https://evil.example/path>", "https://evil.example/path"],
    ["詳細は /0/cf/2026-07 を確認", "/0/cf/2026-07"],
    ["詳細は/0/cf/2026-07です", "/0/cf/2026-07"],
    ["詳細は /0/cf/2026-07/extra です", "/0/cf/2026-07/extra"],
    ['<a href="//evil.example/path">こちら</a>', "//evil.example/path"],
  ])("detects an unproven raw link in %s", (text, expectedLink) => {
    expect(toEvaluationOutput({ text, steps: [] }).textLinks).toEqual([expectedLink]);
  });
});

describe("FinanceChatProvider", () => {
  it("uses injected filesystem checks without requiring a physical demo.db", async () => {
    const dependencies = createDependencies();
    const provider = new FinanceChatProvider({}, dependencies);

    await expect(
      provider.callApi("今月どう？", {
        prompt: { raw: "今月どう？", label: "今月どう？" },
        vars: { evaluationDate: "2026-07-31T03:00:00.000Z" },
      }),
    ).resolves.toEqual({
      output: JSON.stringify({
        text: "回答",
        charts: [],
        toolTrace: [],
        toolRoutes: [],
        textLinks: [],
      }),
    });

    expect(dependencies.isDatabaseAvailable).toBeDefined();
    expect(dependencies.generate).toHaveBeenCalledOnce();
    const options = vi.mocked(dependencies.generate).mock.calls[0]![0];
    expect(options.maxOutputTokens).toBe(2_000);
    expect(options.system).toContain("現在日付は2026-07-31（Asia/Tokyo）");
    expect(options.prepareStep({ stepNumber: 7 })).toBeUndefined();
    expect(options.prepareStep({ stepNumber: 8 })).toEqual({ toolChoice: "none" });
  });

  it("reports a missing demo database clearly", async () => {
    const provider = new FinanceChatProvider(
      {},
      createDependencies({ isDatabaseAvailable: () => false }),
    );

    await expect(provider.callApi("質問")).resolves.toEqual({
      error:
        "評価用demo.dbがありません。`pnpm --filter @mf-dashboard/db build:demo`を実行してください。",
    });
  });

  it("rejects a database other than the canonical demo database", async () => {
    const dependencies = createDependencies({
      getDatabasePath: () => "/private/moneyforward.db",
    });
    const provider = new FinanceChatProvider({}, dependencies);

    await expect(provider.callApi("質問")).resolves.toEqual({
      error: "評価では匿名化されたdata/demo.dbのみ使用できます。",
    });
    expect(dependencies.generate).not.toHaveBeenCalled();
    expect(dependencies.getDb).not.toHaveBeenCalled();
  });

  it("reports missing provider credentials clearly", async () => {
    const provider = new FinanceChatProvider({}, createDependencies({ isLLMEnabled: () => false }));

    await expect(provider.callApi("質問")).resolves.toEqual({
      error: "AI_PROVIDER、AI_MODEL、AI_API_KEYを設定してください。",
    });
  });

  it("closes the database during provider cleanup", () => {
    const dependencies = createDependencies();
    new FinanceChatProvider({}, dependencies).cleanup();
    expect(dependencies.closeDb).toHaveBeenCalledOnce();
  });
});
