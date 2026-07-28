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

  test("binds database facts to a scoped query and the same result row", () => {
    const config = {
      expectedDatabaseRows: [["313235", "219894"]],
      expectedDatabaseValues: ["313235", "219894"],
      requiredDatabaseQueryPatterns: ["transactions", "2026-07", ":groupId", "\\bsum\\s*\\("],
    };

    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT 313235 AS income, 219894 AS expense, SUM(amount) FROM transactions WHERE date LIKE '2026-07%' AND group_id = :groupId",
              },
              output: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT SUM(income), SUM(expense) FROM transactions WHERE date LIKE '2026-07%' AND group_id = :groupId",
              },
              output: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT SUM(amount) FROM transactions WHERE date LIKE '2026-07%' AND group_id = :groupId",
              },
              output: {
                rows: [{ income: 313_235 }, { expense: 219_894 }],
                truncated: false,
              },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
  });

  test("requires no-data answers to be backed by an empty database result", () => {
    const config = {
      forbiddenNoDataQueryPatterns: ["\\b1\\s*=\\s*0\\b", "\\blimit\\b"],
      requiredNoDataQueryPatterns: ["transactions", "2030-01", "食費", ":groupId"],
      requireNoDataEvidence: true,
    };

    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT amount FROM transactions WHERE date >= '2030-01-01' AND category = '食費' AND group_id = :groupId",
              },
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
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: { sql: "SELECT * FROM accounts WHERE 1 = 0" },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("データなし") });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT amount FROM transactions WHERE date >= '2030-01-01' AND category = '食費' AND group_id = :groupId LIMIT 0",
              },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("データなし") });
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

  test("binds monthly values to the requested period", () => {
    const config = {
      expectedScopedTextPairs: {
        scopeFact: "2026年7月",
        pairs: [
          ["収入", "313235"],
          ["支出", "219894"],
          ["収支", "93341"],
        ] as Array<[string, string]>,
      },
    };

    expect(
      assertFinanceChatOutput(
        output({
          text: "2026年7月について確認しました。2026年6月の収入は313,235円、支出は219,894円、収支は93,341円です。",
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          text: ["## 2026年7月", "収入は313,235円、支出は219,894円、収支は93,341円です。"].join(
            "\n",
          ),
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
  });

  test("accepts a value after a repeated heading label", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "## 収入・支出・収支\n収入は313,235円、支出は219,894円、収支は93,341円です。",
        }),
        {
          config: {
            expectedTextPairs: [
              ["収入", "313235"],
              ["支出", "219894"],
              ["収支", "93341"],
            ],
          },
        },
      ),
    ).toMatchObject({ pass: true });
  });

  test("rejects displayed amounts that are not expected or database-backed", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "2026年7月の収入は313,235円、支出は219,894円、収支は93,341円、予算は999,999円です。",
          databaseQueries: [
            {
              input: { sql: "SELECT 999999 AS budget" },
              output: {
                rows: [{ budget: 999_999, expense: 219_894, income: 313_235 }],
                truncated: false,
              },
            },
          ],
        }),
        {
          config: {
            allowOnlyGroundedAmounts: true,
            expectedDatabaseValues: ["313235", "219894"],
            expectedTextPairs: [
              ["収入", "313235"],
              ["支出", "219894"],
              ["収支", "93341"],
            ],
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("999999") });
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
              title: "2026年7月の食費",
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
    expect(
      assertFinanceChatOutput(output({ charts: [{ ...chart, title: "2025年6月の食費" }] }), {
        config: {
          expectedCharts: [
            {
              title: "2026年7月の食費",
              chartType: "pie",
              unit: "currency",
              series: [{ name: "支出", amountType: "expense" }],
              data: chart.data,
            },
          ],
        },
      }),
    ).toMatchObject({ pass: false });
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
        config: {
          expectedMarkdownRows: [["2026-07-03", "サンマルクカフェ", "999"]],
          requireExactMarkdownRows: true,
        },
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          text: `${text}\n| 2026-07-04 | 架空店舗 | 999円 |`,
        }),
        {
          config: {
            expectedMarkdownRows: [["2026-07-03", "サンマルクカフェ", "761"]],
            requireExactMarkdownRows: true,
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("想定外") });
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
    expect(
      assertFinanceChatOutput(output({ text: "データはありませんが、食費は-1.5万円程度です。" }), {
        config: { forbidAmounts: true },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("金額") });
  });

  test("normalizes compact yen units for grounded amount checks", () => {
    expect(
      assertFinanceChatOutput(output({ text: "食費は1.5万円です。" }), {
        config: {
          allowOnlyGroundedAmounts: true,
          expectedTextPairs: [["食費", "15000"]],
        },
      }),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(output({ text: "食費は1.5万円、予算は2万円です。" }), {
        config: {
          allowOnlyGroundedAmounts: true,
          expectedTextPairs: [["食費", "15000"]],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("20000") });
  });

  test("accepts natural no-data wording while rejecting internal terms", () => {
    const config = {
      expectedTextPatterns: ["(?:データ|明細|記録|取引).*(?:ありません|ない|見つかりません)"],
      forbiddenTextTerms: ["transactions"],
    };

    expect(
      assertFinanceChatOutput(output({ text: "該当する食費の記録はありません。" }), { config }),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(output({ text: "transactionsテーブルにデータはありません。" }), {
        config,
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("禁止用語") });
  });

  test("rejects malformed provider output", () => {
    expect(assertFinanceChatOutput("not json", {})).toMatchObject({ pass: false });
    expect(assertFinanceChatOutput(JSON.stringify({ text: "missing fields" }), {})).toMatchObject({
      pass: false,
    });
  });
});
