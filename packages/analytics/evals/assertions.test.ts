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

  test("accepts a zero count as no-data evidence", () => {
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ amount: null }], truncated: false },
          databaseQueries: [
            {
              input: {
                sql: "SELECT COUNT(*) AS count FROM transactions WHERE date LIKE '2030-01%'",
              },
              output: { rows: [{ count: 0 }], truncated: false },
            },
          ],
        }),
        {
          config: {
            databaseEvidence: {
              expectNoData: true,
              requiredSqlPatterns: [
                "\\btransactions\\b",
                "2030-01",
                "\\bcount\\s*\\(\\s*\\*\\s*\\)",
              ],
            },
          },
        },
      ),
    ).toMatchObject({ pass: true });
  });

  test("uses the final repeated label as the authoritative claim", () => {
    expect(
      assertFinanceChatOutput(output({ text: "収入は313,235円です。訂正: 収入は0円です。" }), {
        config: { expectedTextPairs: [["収入", "313235"]] },
      }),
    ).toMatchObject({ pass: false });
  });

  test("ignores a later repeated label without a monetary claim", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "収入は313,235円、支出は219,894円、収支は93,341円です。以上が収入・支出・収支です。",
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
    expect(
      assertFinanceChatOutput(output({ text: "食費は41,837円です。以下は食費の内訳です。" }), {
        config: { expectedTextPairs: [["食費", "41837"]] },
      }),
    ).toMatchObject({ pass: true });
  });

  test("rejects conflicting values within the authoritative label claim", () => {
    expect(
      assertFinanceChatOutput(output({ text: "収入は313,235円または0円です。" }), {
        config: { expectedTextPairs: [["収入", "313235"]] },
      }),
    ).toMatchObject({ pass: false });
  });

  test("rejects an additional ungrounded monetary claim", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "予算は999,999円です。2026年7月の収入は313,235円、支出は219,894円、収支は93,341円です。",
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
    ).toMatchObject({ pass: false, reason: expect.stringContaining("根拠のない金額") });
    expect(
      assertFinanceChatOutput(
        output({
          text: "予算は313,235円です。2026年7月の収入は313,235円、支出は219,894円、収支は93,341円です。",
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
    ).toMatchObject({ pass: false, reason: expect.stringContaining("根拠のない金額") });
  });

  test("rejects a direct negation of the expected monetary claim", () => {
    expect(
      assertFinanceChatOutput(output({ text: "収入は313,235円ではありません。" }), {
        config: { expectedTextPairs: [["収入", "313235"]] },
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(output({ text: "収入は313,235円未満です。" }), {
        config: { expectedTextPairs: [["収入", "313235"]] },
      }),
    ).toMatchObject({ pass: false });
  });

  test("allows grounded breakdown amounts after an expected total", () => {
    const chart = {
      title: "食費",
      chartType: "pie" as const,
      unit: "currency" as const,
      series: [{ name: "支出", amountType: "expense" as const }],
      data: [
        { label: "食料品", values: [24_833] },
        { label: "外食", values: [12_214] },
        { label: "カフェ", values: [4_790] },
      ],
    };
    expect(
      assertFinanceChatOutput(
        output({
          text: "食費は41,837円です。内訳は食料品24,833円、外食12,214円、カフェ4,790円です。",
          charts: [chart],
        }),
        {
          config: {
            expectedTextPairs: [["食費", "41837"]],
            expectedCharts: [
              {
                chartType: "pie",
                unit: "currency",
                series: chart.series,
                data: chart.data,
              },
            ],
          },
        },
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
          expectedMarkdownColumns: ["日付", "内容", "金額"],
          expectedMarkdownRows: [["2026-07-03", "サンマルクカフェ", "761"]],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("期待しない") });

    const shuffledRow = [
      "| 日付 | 内容 | 金額 |",
      "| --- | --- | ---: |",
      "| 761円 | 2026-07-03 | サンマルクカフェ |",
    ].join("\n");
    expect(
      assertFinanceChatOutput(output({ text: shuffledRow }), {
        config: {
          expectedMarkdownColumns: ["日付", "内容", "金額"],
          expectedMarkdownRows: [["2026-07-03", "サンマルクカフェ", "761"]],
        },
      }),
    ).toMatchObject({ pass: false });
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

  test("ignores unused route tool calls when the rendered link is proven", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "[収支を見る](/0/cf/2026-07)",
          textLinks: ["/0/cf/2026-07"],
          textRoutes: ["/0/cf/2026-07"],
          toolRoutes: ["/0/cf/2026-06", "/0/cf/2026-07"],
        }),
        {
          config: {
            expectedTextLinks: ["/0/cf/2026-07"],
            expectedToolRoutes: ["/0/cf/2026-07"],
          },
        },
      ),
    ).toMatchObject({ pass: true });
  });

  test("rejects an ungrounded amount in a link-only answer", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "収支は999,999円です。[収支を見る](/0/cf/2026-07)",
          textLinks: ["/0/cf/2026-07"],
          textRoutes: ["/0/cf/2026-07"],
          toolRoutes: ["/0/cf/2026-07"],
        }),
        {
          config: {
            expectedTextLinks: ["/0/cf/2026-07"],
            expectedToolRoutes: ["/0/cf/2026-07"],
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("根拠のない金額") });
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
      assertFinanceChatOutput(
        output({ text: "2030年1月の食費データはありませんが、目安は一万くらいです。" }),
        { config: { forbidAmounts: true } },
      ),
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
          expectedRowAssociations: [["income", "313235"]],
          expectedRows: [["313235"]],
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
      reason: expect.stringContaining("queryDatabase"),
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

  test("compares complete fixture and model result rows", () => {
    const context = {
      config: {
        databaseEvidence: {
          expectedRowAssociations: [
            ["食料品", "24833"],
            ["外食", "12214"],
          ],
          expectedRows: [
            ["食料品", "24833"],
            ["外食", "12214"],
          ],
          requiredSqlPatterns: ["\\btransactions\\b", derivedAmountSqlPattern],
        },
      },
    };
    const query = {
      input: { sql: "SELECT sub_category, SUM(amount) FROM transactions GROUP BY sub_category" },
      output: {
        rows: [
          { sub_category: "食料品", total: 24_833 },
          { sub_category: "外食", total: 12_214 },
        ],
        truncated: false,
      },
    };
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: query.output,
          databaseQueries: [query],
        }),
        context,
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: {
            rows: [...query.output.rows, { sub_category: "カフェ", total: 4_790 }],
            truncated: false,
          },
          databaseQueries: [query],
        }),
        context,
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("fixture") });

    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: query.output,
          databaseQueries: [
            {
              input: {
                sql: "SELECT sub_category, SUM(amount) FROM transactions GROUP BY sub_category",
              },
              output: {
                rows: [
                  { label: "食料品", total: 24_833 },
                  { label: "外食", total: 12_214 },
                ],
                truncated: false,
              },
            },
          ],
        }),
        context,
      ),
    ).toMatchObject({ pass: true });
  });

  test("accepts an equivalent grouped model result shape", () => {
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: {
            rows: [{ income: 313_235, expense: 219_894 }],
            truncated: false,
          },
          databaseQueries: [
            {
              input: {
                sql: "SELECT type, SUM(amount) AS total FROM transactions GROUP BY type",
              },
              output: {
                rows: [
                  { type: "income", total: 313_235 },
                  { type: "expense", total: 219_894 },
                ],
                truncated: false,
              },
            },
          ],
        }),
        {
          config: {
            databaseEvidence: {
              expectedRows: [["313235", "219894"]],
              expectedRowAssociations: [
                ["income", "313235"],
                ["expense", "219894"],
              ],
              requiredSqlPatterns: ["\\btransactions\\b", derivedAmountSqlPattern],
            },
          },
        },
      ),
    ).toMatchObject({ pass: true });

    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: {
            rows: [{ income: 313_235, expense: 219_894 }],
            truncated: false,
          },
          databaseQueries: [
            {
              input: {
                sql: "SELECT amount AS income, amount AS expense FROM transactions",
              },
              output: {
                rows: [{ income: 219_894, expense: 313_235 }],
                truncated: false,
              },
            },
          ],
        }),
        {
          config: {
            databaseEvidence: {
              expectedRows: [["313235", "219894"]],
              expectedRowAssociations: [
                ["income", "313235"],
                ["expense", "219894"],
              ],
              requiredSqlPatterns: ["\\btransactions\\b", derivedAmountSqlPattern],
            },
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("関連") });
  });

  test("rejects a period fact that is immediately negated", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "2026年7月ではなく2025年7月の収入は313,235円、支出は219,894円です。",
        }),
        { config: { expectedTextFacts: ["2026年7月"] } },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          text: "2026年7月のデータではなく、2025年7月の収入は313,235円です。",
        }),
        { config: { expectedTextFacts: ["2026年7月"] } },
      ),
    ).toMatchObject({ pass: false });
  });

  test("rejects monetary claims outside an exact Markdown table", () => {
    const text = [
      "| 日付 | 内容 | 金額 |",
      "| --- | --- | ---: |",
      "| 2026-07-03 | サンマルクカフェ | 761円 |",
      "",
      "なお、架空店舗で9,999円の支出もありました。",
    ].join("\n");
    expect(
      assertFinanceChatOutput(output({ text }), {
        config: {
          exactMarkdownRows: true,
          expectedMarkdownColumns: ["日付", "内容", "金額"],
          expectedMarkdownRows: [["2026-07-03", "サンマルクカフェ", "761"]],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("表の外") });
    expect(
      assertFinanceChatOutput(
        output({
          text: text.replace("なお、架空店舗で9,999円の支出もありました。", "合計は761円です。"),
        }),
        {
          config: {
            exactMarkdownRows: true,
            expectedMarkdownColumns: ["日付", "内容", "金額"],
            expectedMarkdownRows: [["2026-07-03", "サンマルクカフェ", "761"]],
          },
        },
      ),
    ).toMatchObject({ pass: true });
  });

  test("rejects unverified columns in an exact Markdown table", () => {
    const text = [
      "| 日付 | 内容 | 金額 | 口座 |",
      "| --- | --- | ---: | --- |",
      "| 2026-07-03 | サンマルクカフェ | 761円 | 架空銀行 |",
    ].join("\n");
    expect(
      assertFinanceChatOutput(output({ text }), {
        config: {
          exactMarkdownRows: true,
          expectedMarkdownColumns: ["日付", "内容", "金額"],
          expectedMarkdownRows: [["2026-07-03", "サンマルクカフェ", "761"]],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("列") });
  });

  test("rejects a negated no-data expression", () => {
    const pattern =
      "(?:データ|明細)(?:が|は)?(?:ありません|ない|見つかりません)(?!とは(?:言え|いえ)ません|わけでは(?:ありません|ない))";
    expect(
      assertFinanceChatOutput(output({ text: "2030年1月の食費データがありません。" }), {
        config: { expectedTextPatterns: [pattern] },
      }),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(output({ text: "2030年1月の食費データがないとは言えません。" }), {
        config: { expectedTextPatterns: [pattern] },
      }),
    ).toMatchObject({ pass: false });
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
          fixtureResult: { rows: [{ amount: null }], truncated: false },
          databaseQueries: [
            {
              input: { sql: "SELECT amount FROM transactions WHERE date < '2030-01'" },
              output: { rows: [{ amount: 1_000 }], truncated: false },
            },
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
