import { describe, expect, it } from "vitest";
import assertFinanceChatOutput from "./assertions";

function output(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    text: "2026年7月の収入は313,235円、支出は219,894円、収支は93,341円です。",
    charts: [],
    toolTrace: [],
    toolRoutes: [],
    textLinks: [],
    ...overrides,
  });
}

describe("assertFinanceChatOutput", () => {
  it("accepts normalized text facts and an output without unsolicited charts or links", () => {
    expect(
      assertFinanceChatOutput(output(), {
        config: {
          expectedCharts: [],
          expectedTextFacts: ["2026年7月"],
          expectedTextPairs: [
            ["収入", "313235"],
            ["支出", "219894"],
            ["収支", "93341"],
          ],
          expectedTextLinks: [],
          expectedToolRoutes: [],
        },
      }),
    ).toMatchObject({ pass: true, score: 1 });
  });

  it("rejects malformed evaluation output", () => {
    expect(assertFinanceChatOutput("not json", {})).toMatchObject({ pass: false, score: 0 });
  });

  it("rejects amounts bound to the wrong financial labels", () => {
    expect(
      assertFinanceChatOutput(
        output({ text: "収入は219,894円、支出は313,235円、収支は93,341円です。" }),
        {
          config: {
            expectedCharts: [],
            expectedTextPairs: [
              ["収入", "313235"],
              ["支出", "219894"],
              ["収支", "93341"],
            ],
            expectedTextLinks: [],
            expectedToolRoutes: [],
          },
        },
      ),
    ).toMatchObject({ pass: false });
  });

  it("rejects numeric facts with extra digits", () => {
    expect(
      assertFinanceChatOutput(output({ text: "食費は418,370円です。" }), {
        config: {
          expectedCharts: [],
          expectedTextFacts: ["41837"],
          expectedTextLinks: [],
          expectedToolRoutes: [],
        },
      }),
    ).toMatchObject({ pass: false });

    expect(
      assertFinanceChatOutput(output({ text: "収入は3,132,350円です。" }), {
        config: {
          expectedCharts: [],
          expectedTextPairs: [["収入", "313235"]],
          expectedTextLinks: [],
          expectedToolRoutes: [],
        },
      }),
    ).toMatchObject({ pass: false });

    for (const text of ["収支は-93,341円です。", "収支は93,341.5円です。"]) {
      expect(
        assertFinanceChatOutput(output({ text }), {
          config: {
            expectedCharts: [],
            expectedTextPairs: [["収支", "93341"]],
            expectedTextLinks: [],
            expectedToolRoutes: [],
          },
        }),
      ).toMatchObject({ pass: false });
    }
  });

  it("binds label-value pairs across Markdown cells and common separators", () => {
    const config = {
      expectedCharts: [],
      expectedTextPairs: [
        ["収入", "313235"],
        ["支出", "219894"],
        ["収支", "93341"],
      ] as Array<[string, string]>,
      expectedTextLinks: [],
      expectedToolRoutes: [],
    };

    expect(
      assertFinanceChatOutput(
        output({
          text: [
            "| 項目 | 金額 |",
            "| --- | ---: |",
            "| 収入 | 313,235円 |",
            "| 支出 | 219,894円 |",
            "| 収支 | 93,341円 |",
          ].join("\n"),
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({ text: "収入は219,894円 / 支出は313,235円 / 収支は93,341円です。" }),
        { config },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(output({ text: "収支は93,341円です。最終的な収支は1,000円です。" }), {
        config: {
          expectedCharts: [],
          expectedTextPairs: [["収支", "93341"]],
          expectedTextLinks: [],
          expectedToolRoutes: [],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("requires a successful database query for data-backed cases", () => {
    const config = {
      expectedCharts: [],
      expectedTextLinks: [],
      expectedToolRoutes: [],
      requiresDatabaseQuery: true,
    };

    expect(assertFinanceChatOutput(output(), { config })).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          toolTrace: [
            {
              input: { sql: "SELECT 1" },
              succeeded: false,
              toolName: "queryDatabase",
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          toolTrace: [
            {
              input: { sql: "SELECT 1" },
              output: [{ value: 1 }],
              succeeded: true,
              toolName: "queryDatabase",
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
  });

  it("requires chart structure and order", () => {
    const charts = [
      {
        title: "食費",
        chartType: "pie",
        unit: "currency",
        series: [{ name: "支出", amountType: "expense" }],
        data: [
          { label: "食料品", values: [24833] },
          { label: "外食", values: [12214] },
          { label: "カフェ", values: [4790] },
        ],
      },
    ];

    expect(
      assertFinanceChatOutput(output({ charts }), {
        config: {
          expectedCharts: [
            {
              chartType: "pie",
              titleIncludes: ["食費"],
              unit: "currency",
              series: [{ name: "支出", amountType: "expense" }],
              data: [
                { label: "食料品", values: [24833] },
                { label: "外食", values: [12214] },
                { label: "カフェ", values: [4790] },
              ],
            },
          ],
          expectedTextLinks: [],
          expectedToolRoutes: [],
        },
      }),
    ).toMatchObject({ pass: true });

    expect(
      assertFinanceChatOutput(output({ charts: [{ ...charts[0], title: "2026年7月の収入" }] }), {
        config: {
          expectedCharts: [{ chartType: "pie", titleIncludes: ["食費"] }],
          expectedTextLinks: [],
          expectedToolRoutes: [],
        },
      }),
    ).toMatchObject({ pass: false });

    expect(
      assertFinanceChatOutput(
        output({
          charts: [
            {
              ...charts[0],
              data: [...charts[0]!.data, { label: "その他", values: [100000] }],
            },
          ],
        }),
        {
          config: {
            expectedCharts: [
              {
                chartType: "pie",
                unit: "currency",
                data: [
                  { label: "食料品", values: [24833] },
                  { label: "外食", values: [12214] },
                  { label: "カフェ", values: [4790] },
                ],
              },
            ],
            expectedTextLinks: [],
            expectedToolRoutes: [],
          },
        },
      ),
    ).toMatchObject({ pass: false });

    expect(
      assertFinanceChatOutput(output({ charts: [...charts, charts[0]] }), {
        config: {
          expectedCharts: [{ chartType: "pie" }],
          expectedTextLinks: [],
          expectedToolRoutes: [],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects fabricated amounts in a no-data answer", () => {
    const config = {
      expectedCharts: [],
      expectedTextLinks: [],
      expectedToolRoutes: [],
      forbidAmounts: true,
    };

    expect(
      assertFinanceChatOutput(output({ text: "対象期間のデータはありません。" }), { config }),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(output({ text: "データはありませんが、支出は100,000円です。" }), {
        config,
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(output({ text: "データはありませんが、支出は10万円です。" }), {
        config,
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(output({ text: "データはありませんが、支出は1.5億円です。" }), {
        config,
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({ text: "対象期間のデータはありません。支出は100000です。" }),
        {
          config,
        },
      ),
    ).toMatchObject({ pass: false });
  });

  it("requires exact transaction rows without additional rows", () => {
    const text = [
      "| 日付 | 内容 | 金額 |",
      "| --- | --- | ---: |",
      "| 2026-07-10 | 東京ガス ガス代 | 3,435円 |",
      "| 2026-07-10 | 成城石井 | 3,152円 |",
    ].join("\n");
    const config = {
      expectedCharts: [],
      expectedMarkdownRows: [
        ["2026-07-10", "東京ガス ガス代", "3435"],
        ["2026-07-10", "成城石井", "3152"],
      ],
      expectedTextLinks: [],
      expectedToolRoutes: [],
    };

    expect(assertFinanceChatOutput(output({ text }), { config })).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          text: text
            .split("\n")
            .toSpliced(2, 2, ...text.split("\n").slice(2).reverse())
            .join("\n"),
        }),
        {
          config,
        },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({ text: text.replace("東京ガス ガス代 | 3,435", "東京ガス ガス代 | 34,350") }),
        { config },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(output({ text: `${text}\n| 2026-07-10 | 架空明細 | 1,000円 |` }), {
        config,
      }),
    ).toMatchObject({ pass: false });
  });

  it("requires every Markdown link to match a route tool result", () => {
    const config = {
      expectedCharts: [],
      expectedTextLinks: ["/0/cf/2026-07"],
      expectedToolRoutes: ["/0/cf/2026-07"],
    };

    expect(
      assertFinanceChatOutput(
        output({
          text: "[2026年7月の収支を確認](/0/cf/2026-07)",
          toolRoutes: ["/0/cf/2026-07"],
          textLinks: ["/0/cf/2026-07"],
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });

    expect(
      assertFinanceChatOutput(
        output({
          text: "[2026年7月の収支を確認](/0/cf/2026-07)",
          textLinks: ["/0/cf/2026-07"],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
  });
});
