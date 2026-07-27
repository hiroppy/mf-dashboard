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
    getAccountIdsForGroup: vi
      .fn<ProviderDependencies["getAccountIdsForGroup"]>()
      .mockResolvedValue([1]),
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
    queryFixture: vi
      .fn<ProviderDependencies["queryFixture"]>()
      .mockResolvedValue({ rows: [], truncated: false }),
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
                toolCallId: "query-1",
                toolName: "queryDatabase",
                output: { rows: [{ amount: 100 }], truncated: false },
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
      finalText: "[収支を見る](/0/cf/2026-07)",
      intermediateText: ["[収支を見る](/0/cf/2026-07)"],
      charts: [chart],
      databaseQueries: [
        {
          input: { sql: "SELECT amount FROM transactions" },
          output: { rows: [{ amount: 100 }], truncated: false },
        },
      ],
      fixtureResult: null,
      toolRoutes: ["/0/cf/2026-07"],
      textLinks: ["/0/cf/2026-07"],
      textRoutes: ["/0/cf/2026-07"],
    });
  });

  test("collects visible routes from chart titles", () => {
    const output = toEvaluationOutput({
      text: "回答",
      steps: [
        {
          text: "",
          toolCalls: [],
          toolResults: [
            {
              toolCallId: "chart-1",
              toolName: "presentChart",
              output: {
                title: "食費 /0/bs https://evil.example",
                chartType: "pie",
                unit: "currency",
                series: [{ name: "支出", amountType: "expense" }],
                data: [{ label: "食料品", values: [100] }],
              },
            },
          ],
        },
      ],
    });

    expect(output.textLinks).toEqual(["https://evil.example"]);
    expect(output.textRoutes).toEqual(["/0/bs"]);
  });

  test("collects bare relative dashboard routes", () => {
    const output = toEvaluationOutput({
      text: "詳細は `/0/cf/2026-07`",
      steps: [],
    });

    expect(output.textLinks).toEqual([]);
    expect(output.textRoutes).toEqual(["/0/cf/2026-07"]);
  });

  test("decodes character references before collecting routes", () => {
    const output = toEvaluationOutput({
      text: "&#47;0&#47;bs &sol;0&sol;cf",
      steps: [],
    });

    expect(output.textRoutes).toEqual(["/0/bs", "/0/cf"]);
  });

  test("decodes a named colon before collecting visible URLs", () => {
    const output = toEvaluationOutput({
      text: "https&colon;//example.com/",
      steps: [],
    });

    expect(output.textLinks).toEqual(["https://example.com/"]);
  });

  test("does not treat an indented code block as a clickable link", () => {
    const output = toEvaluationOutput({
      text: "    [収支を見る](/0/cf/2026-07)",
      steps: [],
    });

    expect(output.textLinks).toEqual([]);
    expect(output.textRoutes).toEqual(["/0/cf/2026-07"]);
  });

  test("does not treat an angle-bracketed relative route as an autolink", () => {
    const output = toEvaluationOutput({
      text: "<../0/cf/2026-07>\n</0/cf/2026-07>",
      steps: [],
    });

    expect(output.textLinks).toEqual([]);
    expect(output.textRoutes).toEqual(["/0/cf/2026-07"]);
  });

  test("extracts a Markdown link with a destination title", () => {
    const output = toEvaluationOutput({
      text: '[収支を見る](/0/cf/2026-07 "2026年7月の収支")',
      steps: [],
    });

    expect(output.textLinks).toEqual(["/0/cf/2026-07"]);
  });

  test("extracts a rendered reference-style Markdown link", () => {
    const output = toEvaluationOutput({
      text: "[2026年7月の収支を確認][収支]\n\n[収支]: /0/cf/2026-07",
      steps: [],
    });

    expect(output.textLinks).toEqual(["/0/cf/2026-07"]);
  });

  test("normalizes whitespace in Markdown reference labels", () => {
    const output = toEvaluationOutput({
      text: "[2026年7月の収支を確認][cash flow]\n\n[cash   flow]: /0/cf/2026-07",
      steps: [],
    });

    expect(output.textLinks).toEqual(["/0/cf/2026-07"]);
  });

  test("preserves the first valid duplicate reference definition", () => {
    const output = toEvaluationOutput({
      text: "[2026年7月の収支を確認][x]\n\n[x]: /0/bs\n[x]: /0/cf/2026-07",
      steps: [],
    });

    expect(output.textLinks).toEqual(["/0/bs"]);
  });

  test("extracts a collapsed reference-style Markdown link", () => {
    const output = toEvaluationOutput({
      text: "[2026年7月の収支を確認][]\n\n[2026年7月の収支を確認]: /0/cf/2026-07",
      steps: [],
    });

    expect(output.textLinks).toEqual(["/0/cf/2026-07"]);
  });

  test("extracts a shortcut reference-style Markdown link", () => {
    const output = toEvaluationOutput({
      text: "[2026年7月の収支]\n\n[2026年7月の収支]: /0/cf/2026-07",
      steps: [],
    });

    expect(output.textLinks).toEqual(["/0/cf/2026-07"]);
  });

  test("does not treat a reference-style image as a clickable link", () => {
    const output = toEvaluationOutput({
      text: "![2026年7月の収支][収支]\n\n[収支]: /0/cf/2026-07",
      steps: [],
    });

    expect(output.textLinks).toEqual([]);
  });

  test("does not collect a Markdown image destination as a text route", () => {
    const output = toEvaluationOutput({
      text: "![2026年7月の収支](/0/cf/2026-07)",
      steps: [],
    });

    expect(output.textLinks).toEqual([]);
    expect(output.textRoutes).toEqual([]);
  });

  test("removes a nested Markdown image label", () => {
    const output = toEvaluationOutput({
      text: "![x[y] 2026年7月の収支](/0/cf/2026-07)",
      steps: [],
    });

    expect(output.text).toContain("![x[y]");
    expect(output.textLinks).toEqual([]);
    expect(output.textRoutes).toEqual([]);
  });

  test("does not collect an unused reference definition as a text route", () => {
    const output = toEvaluationOutput({
      text: "[未使用]: /0/cf/2026-07",
      steps: [],
    });

    expect(output.textLinks).toEqual([]);
    expect(output.textRoutes).toEqual([]);
  });

  test("does not collect an unused reference definition as a raw URL", () => {
    const output = toEvaluationOutput({
      text: "[docs]: https://example.com/",
      steps: [],
    });

    expect(output.textLinks).toEqual([]);
  });

  test("collects a visible raw URL inside a fenced block for safety validation", () => {
    const output = toEvaluationOutput({
      text: "```\nhttps://evil.example\n```",
      steps: [],
    });

    expect(output.textLinks).toEqual(["https://evil.example"]);
  });

  test("preserves routes in invalid reference definitions", () => {
    const output = toEvaluationOutput({
      text: "[/0/bs]: <not a url>",
      steps: [],
    });

    expect(output.textRoutes).toEqual(["/0/bs"]);
  });

  test("normalizes angle-bracketed Markdown destinations", () => {
    const output = toEvaluationOutput({
      text: "[2026年7月の収支を確認](</0/cf/2026-07>)",
      steps: [],
    });

    expect(output.textLinks).toEqual(["/0/cf/2026-07"]);
    expect(output.textRoutes).toEqual(["/0/cf/2026-07"]);
  });

  test("does not collect escaped Markdown links", () => {
    const output = toEvaluationOutput({
      text: "\\[2026年7月の収支を確認](/0/cf/2026-07)",
      steps: [],
    });

    expect(output.textLinks).toEqual([]);
  });

  test("excludes links in HTML comments but keeps visible strikethrough links", () => {
    const output = toEvaluationOutput({
      text: "<!-- [収支](/0/cf/2026-07) -->\n~~[収支](/0/cf/2026-07)~~\n<!-- /0/cf/2026-07 -->",
      steps: [],
    });

    expect(output.textLinks).toEqual(["/0/cf/2026-07"]);
    expect(output.textRoutes).toEqual(["/0/cf/2026-07"]);
  });

  test("excludes links inside hidden HTML elements", () => {
    const output = toEvaluationOutput({
      text: "<span hidden>[収支](/0/cf/2026-07)</span>",
      steps: [],
    });

    expect(output.textLinks).toEqual([]);
    expect(output.textRoutes).toEqual([]);
  });

  test("excludes links inside matching multi-backtick code spans", () => {
    const output = toEvaluationOutput({
      text: "``[収支](/0/cf/2026-07)``",
      steps: [],
    });

    expect(output.textLinks).toEqual([]);
    expect(output.textRoutes).toEqual(["/0/cf/2026-07"]);
  });

  test("keeps user-visible step text and the final response as separate evidence", () => {
    expect(
      toEvaluationOutput({
        text: "データを確認できませんでした",
        steps: [
          {
            text: "2026年7月の収入は313,235円です",
            toolCalls: [],
            toolResults: [],
          },
        ],
      }),
    ).toMatchObject({
      text: "2026年7月の収入は313,235円です",
      finalText: "データを確認できませんでした",
      intermediateText: ["2026年7月の収入は313,235円です"],
    });
  });
});

describe("FinanceChatProvider", () => {
  test("uses the shared production prompt, tools, and limits", async () => {
    const deps = dependencies();
    const provider = new FinanceChatProvider({}, deps);

    const result = await provider.callApi("質問", {
      prompt: {} as never,
      vars: {
        evaluationDate: "2026-07-31T03:00:00.000Z",
        verificationSql: "SELECT amount FROM transactions",
      },
    });

    expect(result.error).toBeUndefined();
    expect(deps.generate).toHaveBeenCalledOnce();
    const options = vi.mocked(deps.generate).mock.calls[0]![0];
    expect(options).toMatchObject({
      maxOutputTokens: FINANCE_CHAT_MAX_OUTPUT_TOKENS,
      prompt: "質問",
      timeout: { totalMs: FINANCE_CHAT_REQUEST_TIMEOUT_MS },
    });
    expect(options.abortSignal).toBeInstanceOf(AbortSignal);
    expect(options.system).toContain("現在日付は2026-07-31（Asia/Tokyo）");
    expect(options.tools).toHaveProperty("queryDatabase");
    expect(options.tools).toHaveProperty("presentChart");
    expect(options.tools).toHaveProperty("getFinanceDashboardRoute");
    expect(deps.queryFixture).toHaveBeenCalledWith(
      expect.anything(),
      "SELECT amount FROM transactions",
      "0",
    );
    expect(
      options.prepareStep({ stepNumber: FINANCE_CHAT_MAX_GENERATION_STEPS - 2 }),
    ).toBeUndefined();
    expect(options.prepareStep({ stepNumber: FINANCE_CHAT_MAX_GENERATION_STEPS - 1 })).toEqual({
      toolChoice: "none",
    });
  });

  test("uses an explicit demo subgroup for tools and fixture verification", async () => {
    const deps = dependencies();
    const provider = new FinanceChatProvider({}, deps);

    const result = await provider.callApi("質問", {
      prompt: {} as never,
      vars: {
        evaluationDate: "2026-07-31T03:00:00.000Z",
        groupId: "demo_group_001",
        verificationSql: "SELECT amount FROM transactions",
      },
    });

    expect(result.error).toBeUndefined();
    expect(deps.getAccountIdsForGroup).toHaveBeenCalledWith(expect.anything(), "demo_group_001");
    expect(deps.queryFixture).toHaveBeenCalledWith(
      expect.anything(),
      "SELECT amount FROM transactions",
      "demo_group_001",
    );
  });

  test("rejects an explicit group that has no demo accounts", async () => {
    const deps = dependencies({
      getAccountIdsForGroup: vi
        .fn<ProviderDependencies["getAccountIdsForGroup"]>()
        .mockResolvedValue([]),
    });
    const provider = new FinanceChatProvider({}, deps);

    await expect(
      provider.callApi("質問", {
        prompt: {} as never,
        vars: {
          evaluationDate: "2026-07-31T03:00:00.000Z",
          groupId: "missing",
        },
      }),
    ).resolves.toMatchObject({ error: expect.stringContaining("指定されたグループ") });
    expect(deps.generate).not.toHaveBeenCalled();
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
    ).resolves.toMatchObject({ error: expect.stringContaining("ISO 8601") });
    expect(deps.generate).not.toHaveBeenCalled();
  });

  test.each(["2026-02-30T03:00:00.000Z", "2026-02-29T00:00:00.000Z"])(
    "rejects a normalized invalid calendar date: %s",
    async (evaluationDate) => {
      const deps = dependencies();
      const provider = new FinanceChatProvider({}, deps);

      await expect(
        provider.callApi("質問", {
          prompt: {} as never,
          vars: { evaluationDate },
        }),
      ).resolves.toMatchObject({ error: expect.stringContaining("有効な日時") });
      expect(deps.generate).not.toHaveBeenCalled();
    },
  );

  test("returns the evaluation date error when context vars are missing", async () => {
    const deps = dependencies();
    const provider = new FinanceChatProvider({}, deps);

    await expect(provider.callApi("質問", { prompt: {} as never } as never)).resolves.toMatchObject(
      { error: expect.stringContaining("ISO 8601文字列") },
    );
    expect(deps.generate).not.toHaveBeenCalled();
  });

  test("closes the shared database during cleanup", () => {
    const deps = dependencies();
    new FinanceChatProvider({}, deps).cleanup();

    expect(deps.closeDb).toHaveBeenCalledOnce();
  });
});
