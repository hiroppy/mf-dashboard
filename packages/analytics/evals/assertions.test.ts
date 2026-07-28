import { describe, expect, test } from "vitest";
import assertFinanceChatOutput from "./assertions";

function output(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    text: "2026年7月の収入は313,235円、支出は219,894円、収支は93,341円です。",
    charts: [],
    databaseQueries: [
      {
        input: { sql: "SELECT income, expense FROM transactions" },
        output: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
      },
    ],
    toolRoutes: [],
    textLinks: [],
    ...overrides,
  });
}

describe("assertFinanceChatOutput", () => {
  test("accepts matching facts, label/value pairs, and empty structured output", () => {
    expect(
      assertFinanceChatOutput(output(), {
        config: {
          expectedCharts: [],
          expectedTextFacts: ["2026年7月"],
          expectedTextLinks: [],
          expectedTextPairs: [
            ["収入", "313235"],
            ["支出", "219894"],
            ["収支", "93341"],
          ],
          expectedToolRoutes: [],
        },
      }),
    ).toMatchObject({ pass: true, score: 1 });
  });

  test("rejects a missing label/value pair", () => {
    expect(
      assertFinanceChatOutput(output(), {
        config: { expectedTextPairs: [["収入", "999999"]] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("収入=999999") });
  });

  test("requires expected facts to be backed by database results", () => {
    expect(
      assertFinanceChatOutput(output({ databaseQueries: [] }), {
        config: { expectedDatabaseValues: ["313235", "219894"] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("DB結果") });
  });

  test("requires no-data answers to be backed by an empty database result", () => {
    const config = { requireNoDataEvidence: true };

    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: { sql: "SELECT amount FROM transactions" },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
    expect(assertFinanceChatOutput(output({ databaseQueries: [] }), { config })).toMatchObject({
      pass: false,
      reason: expect.stringContaining("データなし"),
    });
  });

  test("does not bind a value to a neighboring label", () => {
    expect(
      assertFinanceChatOutput(
        output({ text: "2026年7月の収入は219,894円、支出は313,235円、収支は93,341円です。" }),
        {
          config: {
            expectedTextPairs: [
              ["収入", "313235"],
              ["支出", "219894"],
            ],
          },
        },
      ),
    ).toMatchObject({ pass: false });
  });

  test("compares chart values by label without requiring data order", () => {
    const chart = {
      title: "2026年7月の食費",
      chartType: "pie",
      unit: "currency",
      series: [{ name: "支出", amountType: "expense" }],
      data: [
        { label: "外食", values: [12_214] },
        { label: "食料品", values: [24_833] },
      ],
    };

    expect(
      assertFinanceChatOutput(output({ charts: [chart] }), {
        config: {
          expectedCharts: [
            {
              chartType: "pie",
              unit: "currency",
              series: [{ name: "支出", amountType: "expense" }],
              data: [
                { label: "食料品", values: [24_833] },
                { label: "外食", values: [12_214] },
              ],
            },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  test("requires expected cells to appear in the same Markdown row", () => {
    const text = [
      "| 日付 | 内容 | 金額 |",
      "| --- | --- | ---: |",
      "| 2026-07-03 | サンマルクカフェ | 761円 |",
    ].join("\n");

    expect(
      assertFinanceChatOutput(output({ text }), {
        config: { expectedMarkdownRows: [["2026-07-03", "サンマルクカフェ", "761"]] },
      }),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(output({ text }), {
        config: { expectedMarkdownRows: [["2026-07-03", "サンマルクカフェ", "999"]] },
      }),
    ).toMatchObject({ pass: false });
  });

  test("rejects links that were not returned by the route tool", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "[収支を見る](/0/cf/2026-07)",
          textLinks: ["/0/cf/2026-07"],
        }),
        { config: { expectedTextLinks: ["/0/cf/2026-07"] } },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("route tool") });
  });

  test("rejects internal terms and invented no-data amounts", () => {
    expect(
      assertFinanceChatOutput(output({ text: "transactionsを確認しました。" }), {
        config: { forbiddenTextTerms: ["transactions"] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("禁止用語") });
    expect(
      assertFinanceChatOutput(output({ text: "データはありませんが、1,000円です。" }), {
        config: { forbidAmounts: true },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("金額") });
  });

  test("rejects malformed provider output", () => {
    expect(assertFinanceChatOutput("not json", {})).toMatchObject({ pass: false });
    expect(assertFinanceChatOutput(JSON.stringify({ text: "missing fields" }), {})).toMatchObject({
      pass: false,
    });
  });
});
