import type { Db } from "@mf-dashboard/db";
import { describe, expect, test, vi } from "vitest";
import {
  FINANCE_CHAT_MAX_GENERATION_STEPS,
  FINANCE_CHAT_MAX_OUTPUT_TOKENS,
  FINANCE_CHAT_REQUEST_TIMEOUT_MS,
} from "../src/chat/prompt";
import FinanceChatProvider, { toEvaluationOutput, type ProviderDependencies } from "./provider";

function dependencies(overrides: Partial<ProviderDependencies> = {}): ProviderDependencies {
  return {
    canonicalizePath: (path) => path,
    closeDb: vi.fn<ProviderDependencies["closeDb"]>(),
    generate: vi
      .fn<ProviderDependencies["generate"]>()
      .mockResolvedValue({ text: "回答", steps: [] }),
    getCurrentGroup: vi
      .fn<ProviderDependencies["getCurrentGroup"]>()
      .mockResolvedValue({ id: "0" }),
    getDatabasePath: () => "/repo/data/demo.db",
    getDb: () => ({}) as Db,
    getDemoDatabasePath: () => "/repo/data/demo.db",
    getModel: vi
      .fn<ProviderDependencies["getModel"]>()
      .mockReturnValue({} as ReturnType<ProviderDependencies["getModel"]>),
    isFileAvailable: () => true,
    isLLMEnabled: () => true,
    ...overrides,
  };
}

describe("toEvaluationOutput", () => {
  test("collects final text, valid charts, routes, and rendered links", () => {
    const chart = {
      title: "食費",
      chartType: "pie" as const,
      unit: "currency" as const,
      series: [{ name: "支出", amountType: "expense" as const }],
      data: [{ label: "食料品", values: [100] }],
    };

    expect(
      toEvaluationOutput({
        text: "[収支を見る](/0/cf/2026-07)",
        steps: [
          {
            text: "[収支を見る](/0/cf/2026-07)",
            toolCalls: [
              {
                input: { sql: "SELECT amount FROM transactions" },
                toolCallId: "query-1",
                toolName: "queryDatabase",
              },
            ],
            toolResults: [
              {
                output: { rows: [{ amount: 100 }], truncated: false },
                toolCallId: "query-1",
                toolName: "queryDatabase",
              },
              { toolCallId: "chart-1", toolName: "presentChart", output: chart },
              {
                toolCallId: "route-1",
                toolName: "getFinanceDashboardRoute",
                output: { href: "/0/cf/2026-07" },
              },
              {
                toolCallId: "route-2",
                toolName: "getFinanceDashboardRoute",
                output: { href: "https://example.com" },
              },
            ],
          },
        ],
      }),
    ).toEqual({
      text: "[収支を見る](/0/cf/2026-07)",
      charts: [chart],
      databaseQueries: [
        {
          input: { sql: "SELECT amount FROM transactions" },
          output: { rows: [{ amount: 100 }], truncated: false },
        },
      ],
      textLinkLabels: [{ href: "/0/cf/2026-07", label: "収支を見る" }],
      toolRoutes: ["/0/cf/2026-07"],
      textLinks: ["/0/cf/2026-07"],
    });
  });

  test("collects text shown across every generation step", () => {
    expect(
      toEvaluationOutput({
        text: "最終回答",
        steps: [
          { text: "途中の表示。", toolCalls: [], toolResults: [] },
          { text: "最終回答", toolCalls: [], toolResults: [] },
        ],
      }).text,
    ).toBe("途中の表示。最終回答");
  });

  test("collects a visible bare dashboard route", () => {
    expect(
      toEvaluationOutput({
        text: "unused final text",
        steps: [
          {
            text: "2026年7月の収支は /0/cf/2026-07 で確認できます。",
            toolCalls: [],
            toolResults: [],
          },
        ],
      }).textLinks,
    ).toEqual(["/0/cf/2026-07"]);
  });

  test("removes text and links hidden in HTML comments", () => {
    expect(
      toEvaluationOutput({
        text: "unused final text",
        steps: [
          {
            text: "<!-- 2026年7月 [2026年7月の収支](/0/cf/2026-07) -->",
            toolCalls: [],
            toolResults: [],
          },
        ],
      }),
    ).toMatchObject({ text: "", textLinkLabels: [], textLinks: [] });
  });

  test("does not treat links inside code as rendered links", () => {
    for (const text of [
      "```\n[2026年7月の収支](/0/cf/2026-07)\n``` and `/0/cf/2026-07`",
      "~~~markdown\n[2026年7月の収支](/0/cf/2026-07)\n~~~",
      "    [2026年7月の収支](/0/cf/2026-07)",
    ]) {
      expect(
        toEvaluationOutput({
          text: "unused final text",
          steps: [{ text, toolCalls: [], toolResults: [] }],
        }),
      ).toMatchObject({ textLinkLabels: [], textLinks: [] });
    }
  });

  test("does not treat escaped Markdown links as rendered links", () => {
    expect(
      toEvaluationOutput({
        text: "",
        steps: [
          {
            text: String.raw`\[2026年7月の収支](/0/cf/2026-07)`,
            toolCalls: [],
            toolResults: [],
          },
        ],
      }),
    ).toMatchObject({ textLinkLabels: [], textLinks: [] });
  });

  test("collects rendered HTML anchor links", () => {
    expect(
      toEvaluationOutput({
        text: "",
        steps: [
          {
            text: '<a href="/0/cf/2026-07">2026年7月の収支</a>',
            toolCalls: [],
            toolResults: [],
          },
        ],
      }),
    ).toMatchObject({
      textLinkLabels: [{ href: "/0/cf/2026-07", label: "2026年7月の収支" }],
      textLinks: ["/0/cf/2026-07"],
    });
  });

  test("collects rendered reference-style links", () => {
    expect(
      toEvaluationOutput({
        text: "",
        steps: [
          {
            text: "[2026年7月の収支][target]\n\n[target]: /0/cf/2026-07",
            toolCalls: [],
            toolResults: [],
          },
        ],
      }),
    ).toMatchObject({
      textLinkLabels: [{ href: "/0/cf/2026-07", label: "2026年7月の収支" }],
      textLinks: ["/0/cf/2026-07"],
    });
  });

  test("collects a shortcut reference link", () => {
    expect(
      toEvaluationOutput({
        text: "",
        steps: [
          {
            text: "[2026年7月の収支]\n\n[2026年7月の収支]: /0/cf/2026-07",
            toolCalls: [],
            toolResults: [],
          },
        ],
      }),
    ).toMatchObject({
      textLinkLabels: [{ href: "/0/cf/2026-07", label: "2026年7月の収支" }],
      textLinks: ["/0/cf/2026-07"],
    });
  });

  test("does not collect an unused reference definition", () => {
    expect(
      toEvaluationOutput({
        text: "",
        steps: [
          {
            text: "[unused]: /0/cf/2026-07",
            toolCalls: [],
            toolResults: [],
          },
        ],
      }),
    ).toMatchObject({ textLinkLabels: [], textLinks: [] });
  });

  test("does not collect a hidden HTML anchor", () => {
    expect(
      toEvaluationOutput({
        text: "",
        steps: [
          {
            text: '<a hidden href="/0/cf/2026-07">2026年7月の収支</a>',
            toolCalls: [],
            toolResults: [],
          },
        ],
      }),
    ).toMatchObject({ textLinkLabels: [], textLinks: [] });
  });

  test("does not collect a link after a nested same-name tag in a hidden subtree", () => {
    expect(
      toEvaluationOutput({
        text: "",
        steps: [
          {
            text: '<span hidden><span>無視</span><a href="/0/cf/2026-07">収支</a></span>',
            toolCalls: [],
            toolResults: [],
          },
        ],
      }),
    ).toMatchObject({ textLinkLabels: [], textLinks: [] });
  });

  test("collects an inline Markdown link with a title", () => {
    expect(
      toEvaluationOutput({
        text: "",
        steps: [
          {
            text: '[2026年7月の収支](/0/cf/2026-07 "収支画面")',
            toolCalls: [],
            toolResults: [],
          },
        ],
      }),
    ).toMatchObject({
      textLinkLabels: [{ href: "/0/cf/2026-07", label: "2026年7月の収支" }],
      textLinks: ["/0/cf/2026-07"],
    });
  });

  test("unwraps an angle-bracket inline Markdown destination", () => {
    expect(
      toEvaluationOutput({
        text: "",
        steps: [
          {
            text: "[2026年7月の収支](</0/cf/2026-07>)",
            toolCalls: [],
            toolResults: [],
          },
        ],
      }),
    ).toMatchObject({
      textLinkLabels: [{ href: "/0/cf/2026-07", label: "2026年7月の収支" }],
      textLinks: ["/0/cf/2026-07"],
    });
  });
});

describe("FinanceChatProvider", () => {
  test("uses the shared production prompt, tools, and limits", async () => {
    const deps = dependencies();
    const provider = new FinanceChatProvider({}, deps);

    const result = await provider.callApi("質問", {
      prompt: {} as never,
      vars: { evaluationDate: "2026-07-31T03:00:00.000Z" },
    });

    expect(result.error).toBeUndefined();
    expect(deps.generate).toHaveBeenCalledOnce();
    const options = vi.mocked(deps.generate).mock.calls[0]![0];
    expect(options).toMatchObject({
      abortSignal: expect.any(AbortSignal),
      maxOutputTokens: FINANCE_CHAT_MAX_OUTPUT_TOKENS,
      prompt: "質問",
      timeout: { totalMs: FINANCE_CHAT_REQUEST_TIMEOUT_MS },
    });
    expect(options.system).toContain("現在日付は2026-07-31（Asia/Tokyo）");
    expect(options.tools).toHaveProperty("queryDatabase");
    expect(options.tools).toHaveProperty("presentChart");
    expect(options.tools).toHaveProperty("getFinanceDashboardRoute");
    expect(
      options.prepareStep({ stepNumber: FINANCE_CHAT_MAX_GENERATION_STEPS - 2 }),
    ).toBeUndefined();
    expect(options.prepareStep({ stepNumber: FINANCE_CHAT_MAX_GENERATION_STEPS - 1 })).toEqual({
      toolChoice: "none",
    });
  });

  test.each([
    {
      name: "demo database is missing",
      overrides: {
        getDatabasePath: () => undefined,
      },
      error: "評価用demo.dbがありません",
    },
    {
      name: "database is not the canonical demo fixture",
      overrides: {
        getDatabasePath: () => "/repo/data/moneyforward.db",
      },
      error: "匿名化されたdata/demo.dbのみ",
    },
    {
      name: "LLM credentials are missing",
      overrides: {
        isLLMEnabled: () => false,
      },
      error: "AI_PROVIDER、AI_MODEL、AI_API_KEY",
    },
    {
      name: "the current group is missing",
      overrides: {
        getCurrentGroup: vi
          .fn<ProviderDependencies["getCurrentGroup"]>()
          .mockResolvedValue(undefined),
      },
      error: "現在のグループがありません",
    },
  ])("returns a clear error when $name", async ({ overrides, error }) => {
    const provider = new FinanceChatProvider({}, dependencies(overrides));

    await expect(
      provider.callApi("質問", {
        prompt: {} as never,
        vars: { evaluationDate: "2026-07-31T03:00:00.000Z" },
      }),
    ).resolves.toMatchObject({ error: expect.stringContaining(error) });
  });

  test("rejects an invalid evaluation date before generation", async () => {
    const deps = dependencies();
    const provider = new FinanceChatProvider({}, deps);

    await expect(
      provider.callApi("質問", {
        prompt: {} as never,
        vars: { evaluationDate: "not-a-date" },
      }),
    ).resolves.toMatchObject({ error: expect.stringContaining("有効な日時") });
    expect(deps.generate).not.toHaveBeenCalled();
  });

  test("returns the evaluation date error when context vars are missing", async () => {
    const deps = dependencies();
    const provider = new FinanceChatProvider({}, deps);

    await expect(provider.callApi("質問")).resolves.toMatchObject({
      error: expect.stringContaining("ISO 8601文字列"),
    });
    expect(deps.generate).not.toHaveBeenCalled();
  });

  test("closes the shared database during cleanup", () => {
    const deps = dependencies();
    new FinanceChatProvider({}, deps).cleanup();

    expect(deps.closeDb).toHaveBeenCalledOnce();
  });
});
