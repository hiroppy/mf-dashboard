import { describe, expect, test } from "vitest";
import assertFinanceChatOutput from "./assertions";

const derivedAmountSqlPattern =
  "\\bselect\\b(?:(?!\\bfrom\\b)[\\s\\S])*?(?<!\\bas\\s)\\bamount\\b(?:(?!\\bfrom\\b)[\\s\\S])*?\\bfrom\\b";

function output(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    text: "2026年7月の収入は313,235円、支出は219,894円、収支は93,341円です。",
    charts: [],
    databaseQueries: [],
    fixtureResult: null,
    toolRoutes: [],
    textLinks: [],
    textRoutes: [],
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

  test.each([
    "収入は-313,235円です。",
    "収入は313,235万円です。",
    "収入は313,235円ではなく、実際は0円です。",
  ])("rejects a materially different monetary claim: %s", (text) => {
    expect(
      assertFinanceChatOutput(output({ text }), {
        config: { expectedTextPairs: [["収入", "313235"]] },
      }),
    ).toMatchObject({ pass: false });
  });

  test("does not treat a non-monetary contrast as an amount correction", () => {
    expect(
      assertFinanceChatOutput(
        output({ text: "収入は313,235円です。これは予算ではなく実績です。" }),
        { config: { expectedTextPairs: [["収入", "313235"]] } },
      ),
    ).toMatchObject({ pass: true });
  });

  test("finds a value after a repeated heading label", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: [
            "## 収入・支出・収支",
            "- 収入: 313,235円",
            "- 支出: 219,894円",
            "- 収支: 93,341円",
          ].join("\n"),
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

  test("finds label/value pairs in Markdown table columns", () => {
    const text = [
      "| 収入 | 支出 | 収支 |",
      "| ---: | ---: | ---: |",
      "| 313,235円 | 219,894円 | 93,341円 |",
    ].join("\n");

    expect(
      assertFinanceChatOutput(output({ text }), {
        config: {
          expectedTextPairs: [
            ["収入", "313235"],
            ["支出", "219894"],
            ["収支", "93341"],
          ],
        },
      }),
    ).toMatchObject({ pass: true });
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
              titlePatterns: ["2026年7月", "食費"],
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
      assertFinanceChatOutput(output({ charts: [{ ...chart, title: "2025年7月の食費" }] }), {
        config: {
          expectedCharts: [
            {
              chartType: "pie",
              titlePatterns: ["2026年7月", "食費"],
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
        config: { expectedMarkdownRows: [["2026-07-03", "サンマルクカフェ", "999"]] },
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(output({ text: "2026-07-03 | サンマルクカフェ | 761円" }), {
        config: { expectedMarkdownRows: [["2026-07-03", "サンマルクカフェ", "761"]] },
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(output({ text: `\`\`\`markdown\n${text}\n\`\`\`` }), {
        config: { expectedMarkdownRows: [["2026-07-03", "サンマルクカフェ", "761"]] },
      }),
    ).toMatchObject({ pass: false });

    const separateTables = [
      "| 日付 | 内容 | 金額 |",
      "| --- | --- | ---: |",
      "| 2026-07-03 | 別の店舗 | 999円 |",
      "",
      "| 日付 | 内容 | 金額 |",
      "| --- | --- | ---: |",
      "| 2026-07-04 | サンマルクカフェ | 761円 |",
    ].join("\n");
    expect(
      assertFinanceChatOutput(output({ text: separateTables }), {
        config: { expectedMarkdownRows: [["2026-07-03", "サンマルクカフェ", "761"]] },
      }),
    ).toMatchObject({ pass: false });

    const extraRow = `${text}\n| 2026-07-03 | 架空店舗 | 9,999円 |`;
    expect(
      assertFinanceChatOutput(output({ text: extraRow }), {
        config: {
          exactMarkdownRows: true,
          expectedMarkdownRows: [["2026-07-03", "サンマルクカフェ", "761"]],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("期待しない") });
  });

  test("rejects links that were not returned by the route tool", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "[収支を見る](/0/cf/2026-07)",
          textLinks: ["/0/cf/2026-07"],
          textRoutes: ["/0/cf/2026-07"],
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
      assertFinanceChatOutput(output({ text: "is_internal_transferを除外しました。" }), {
        config: { forbiddenTextTerms: ["is_internal_transfer"] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("禁止用語") });
    expect(
      assertFinanceChatOutput(output({ text: "データはありませんが、1,000円です。" }), {
        config: { forbidAmounts: true },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("金額") });
    expect(
      assertFinanceChatOutput(output({ text: "データはありませんが、目安は1万円です。" }), {
        config: { forbidAmounts: true },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("金額") });
    expect(
      assertFinanceChatOutput(
        output({ text: "2030年1月の食費データはありませんが、目安は1万くらいです。" }),
        { config: { forbidAmounts: true } },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("金額") });
    expect(
      assertFinanceChatOutput(output({ text: "データはありませんが、目安は一万円です。" }), {
        config: { forbidAmounts: true },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("金額") });
    expect(
      assertFinanceChatOutput(output({ text: "データはありませんが、目安は千円です。" }), {
        config: { forbidAmounts: true },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("金額") });
    expect(
      assertFinanceChatOutput(output({ text: "データはありませんが、食費は1,000でした。" }), {
        config: { forbidAmounts: true },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("金額") });
    expect(
      assertFinanceChatOutput(output({ text: "2030年1月の食費データはありません。" }), {
        config: { forbidAmounts: true },
      }),
    ).toMatchObject({ pass: true });
  });

  test("rejects malformed provider output", () => {
    expect(assertFinanceChatOutput("not json", {})).toMatchObject({ pass: false });
    expect(assertFinanceChatOutput(JSON.stringify({ text: "missing fields" }), {})).toMatchObject({
      pass: false,
    });
  });

  test("requires expected facts to be backed by database results", () => {
    const context = {
      config: {
        databaseEvidence: {
          expectedValues: ["313235"],
          requiredSqlPatterns: ["\\btransactions\\b", derivedAmountSqlPattern],
        },
      },
    };
    expect(assertFinanceChatOutput(output(), context)).toMatchObject({
      pass: false,
      reason: expect.stringContaining("queryDatabase"),
    });
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ income: 313_235 }], truncated: false },
          databaseQueries: [
            {
              input: { sql: "SELECT amount AS income FROM transactions" },
              output: { rows: [{ income: 313_235 }], truncated: false },
            },
          ],
        }),
        context,
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ income: 313_235 }], truncated: false },
          databaseQueries: [
            {
              input: { sql: "SELECT 313235 AS amount FROM transactions" },
              output: { rows: [{ income: 313_235 }], truncated: false },
            },
          ],
        }),
        context,
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ income: 1 }], truncated: false },
          databaseQueries: [
            {
              input: {
                sql: "SELECT amount * 0 + 313235 AS income FROM transactions",
              },
              output: { rows: [{ income: 313_235 }], truncated: false },
            },
          ],
        }),
        context,
      ),
    ).toMatchObject({
      pass: false,
      reason: expect.stringContaining("期待する値"),
    });
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ income: 313_235 }], truncated: false },
          databaseQueries: [
            {
              input: { sql: "SELECT amount AS income FROM transactions" },
              output: { rows: [{ income: 1 }], truncated: false },
            },
          ],
        }),
        context,
      ),
    ).toMatchObject({
      pass: false,
      reason: expect.stringContaining("queryDatabase"),
    });
  });

  test("requires an empty or zero database result for no-data claims", () => {
    const context = {
      config: {
        databaseEvidence: {
          expectNoData: true,
          requiredSqlPatterns: ["\\btransactions\\b", "2030-01", derivedAmountSqlPattern],
        },
      },
    };
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ amount: 1 }], truncated: false },
          databaseQueries: [
            {
              input: { sql: "SELECT amount FROM transactions WHERE date LIKE '2030-01%'" },
              output: { rows: [{ amount: 1 }], truncated: false },
            },
          ],
        }),
        context,
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ amount: null }], truncated: false },
          databaseQueries: [
            {
              input: { sql: "SELECT amount FROM transactions WHERE date LIKE '2030-01%'" },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        context,
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ amount: 1_000 }], truncated: false },
          databaseQueries: [
            {
              input: { sql: "SELECT 1" },
              output: { rows: [], truncated: false },
            },
            {
              input: { sql: "SELECT amount FROM transactions WHERE date LIKE '2030-01%'" },
              output: { rows: [{ amount: 1_000 }], truncated: false },
            },
          ],
        }),
        context,
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ amount: null }], truncated: false },
          databaseQueries: [
            {
              input: {
                sql: "SELECT NULL AS amount FROM transactions WHERE date LIKE '2030-01%'",
              },
              output: { rows: [{ amount: null }], truncated: false },
            },
          ],
        }),
        context,
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ amount: null }], truncated: false },
          databaseQueries: [
            {
              input: { sql: "SELECT amount FROM transactions WHERE date LIKE '2030-01%'" },
              output: { rows: [{ amount: 1_000 }], truncated: false },
            },
          ],
        }),
        context,
      ),
    ).toMatchObject({ pass: false });
  });
});
