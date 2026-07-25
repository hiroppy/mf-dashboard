import { describe, expect, it } from "vitest";
import assertFinanceChatOutput from "./assertions";

function output(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    text: "2026年7月の収入は313,235円、支出は219,894円、収支は93,341円です。",
    charts: [],
    renderedLinks: [],
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

    for (const text of [
      "収支は-93,341円です。",
      "収支はマイナス93,341円です。",
      "収支は赤字93,341円です。",
      "収支は93,341円の赤字です。",
      "収支は損失93,341円です。",
      "収支は93,341円より少ないです。",
      "収支は93,341円を超えています。",
      "収支は93,341.5円です。",
    ]) {
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
        output({
          text: "収入は313,235円（給与300,000円、その他13,235円）、支出は219,894円、収支は93,341円です。",
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          text: "収入は313,235円（正しくは0円）、支出は219,894円、収支は93,341円です。",
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          text: "収入は313,235円（訂正: 0円）、支出は219,894円、収支は93,341円です。",
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          text: [
            "## 2026年7月の収入・支出・収支",
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
    expect(
      assertFinanceChatOutput(
        output({ text: "収入は313,235円ではなく0円です。支出は219,894円、収支は93,341円です。" }),
        { config },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({ text: "収入は313235件、支出は219,894円、収支は93,341円です。" }),
        { config },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          text: "食費は41,837円で、内訳は食料品24,833円、外食12,214円、カフェ4,790円です。",
        }),
        {
          config: {
            expectedCharts: [],
            expectedTextLinks: [],
            expectedTextPairs: [["食費", "41837"]],
            expectedToolRoutes: [],
            textPairBoundaries: ["食料品", "外食", "カフェ"],
          },
        },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(output({ text: "収入の予算は313,235円、実績は0円です。" }), {
        config: {
          expectedCharts: [],
          expectedTextLinks: [],
          expectedTextPairs: [["収入", "313235"]],
          expectedToolRoutes: [],
        },
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          text: "収入は313,235円です。内訳は給与300,000円、その他13,235円です。支出は219,894円、収支は93,341円です。",
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({ text: "収入は¥313,235、支出は￥219,894、収支は¥93,341です。" }),
        { config },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({ text: "収入は31万3,235円、支出は21万9,894円、収支は9万3,341円です。" }),
        { config },
      ),
    ).toMatchObject({ pass: true });
  });

  it("requires a relevant successful database query for data-backed cases", () => {
    const config = {
      databaseQuery: {
        expectedRowCount: 1,
        forbiddenSqlPatterns: ["\\b313235\\b"],
        outputCells: [{ columnPattern: "income|収入", value: "313235" }],
        outputSqlPatterns: ["\\bsum\\s*\\(\\s*amount\\s*\\)\\s+as\\s+income\\b"],
        predicatePatterns: [":groupId", "\\bdate\\b\\s*like"],
        sqlPatterns: [
          "\\btransactions\\b",
          "(?:\\bgroup_id\\b\\s*=\\s*:groupId|:groupId\\s*=\\s*(?:\\w+\\.)?group_id\\b)",
          "2026-07",
          "\\bamount\\b",
        ],
      },
      expectedCharts: [],
      expectedTextLinks: [],
      expectedToolRoutes: [],
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
              output: { columns: ["value"], rowCount: 1, rows: [{ value: 1 }], truncated: false },
              succeeded: true,
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
              input: {
                sql: "SELECT SUM(AMOUNT) AS income FROM TRANSACTIONS t WHERE :groupId = t.GROUP_ID AND DATE LIKE '2026-07%'",
              },
              output: {
                columns: ["income"],
                rowCount: 1,
                rows: [{ income: 313_235 }],
                truncated: false,
              },
              succeeded: true,
              toolName: "queryDatabase",
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          toolTrace: [
            {
              input: {
                sql: "SELECT SUM(AMOUNT) AS income FROM TRANSACTIONS t WHERE :groupId = t.GROUP_ID AND DATE LIKE '2026-07%'",
              },
              output: {
                columns: ["income"],
                rowCount: 2,
                rows: [{ income: 313_235 }, { income: 1 }],
                truncated: false,
              },
              succeeded: true,
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
              input: {
                sql: "SELECT SUM(AMOUNT) AS income FROM TRANSACTIONS t WHERE :groupId = t.GROUP_ID AND DATE LIKE '2026-07%'",
              },
              output: {
                columns: ["income"],
                rowCount: 1,
                rows: [{ income: 313_235 }],
                truncated: true,
              },
              succeeded: true,
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
              input: {
                sql: "SELECT SUM(AMOUNT) AS income, SUM(AMOUNT) AS expense FROM TRANSACTIONS WHERE GROUP_ID = :groupId AND DATE LIKE '2026-07%'",
              },
              output: {
                columns: ["income", "expense"],
                rowCount: 1,
                rows: [{ expense: 313_235, income: 219_894 }],
                truncated: false,
              },
              succeeded: true,
              toolName: "queryDatabase",
            },
          ],
        }),
        {
          config: {
            ...config,
            databaseQuery: {
              ...config.databaseQuery,
              outputCells: [
                { columnPattern: "income|収入", value: "313235" },
                { columnPattern: "expense|支出", value: "219894" },
              ],
            },
          },
        },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          toolTrace: [
            {
              input: {
                sql: "SELECT 313235 AS income FROM transactions WHERE group_id = :groupId AND date LIKE '2026-07%' AND amount >= 0",
              },
              output: {
                columns: ["income"],
                rowCount: 1,
                rows: [{ income: 313_235 }],
                truncated: false,
              },
              succeeded: true,
              toolName: "queryDatabase",
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
  });

  it("rejects SQL terms that appear only in a projection literal", () => {
    const config = {
      databaseQuery: {
        expectedRowCount: 1,
        outputCells: [{ columnPattern: "income", value: "313235" }],
        predicatePatterns: [":groupId", "\\bdate\\b\\s*like"],
        sqlPatterns: ["transactions", "amount"],
      },
      expectedCharts: [],
      expectedTextLinks: [],
      expectedToolRoutes: [],
    };
    for (const sql of [
      "SELECT 'transactions 2026-07 group_id = :groupId amount' AS note, 313234 + 1 AS income",
      "SELECT amount, 313234 + 1 AS income FROM transactions WHERE 'group_id = :groupId AND date LIKE 2026-07' = 'x'",
    ]) {
      expect(
        assertFinanceChatOutput(
          output({
            toolTrace: [
              {
                input: { sql },
                output: {
                  columns: ["income"],
                  rowCount: 1,
                  rows: [{ income: 313_235 }],
                  truncated: false,
                },
                succeeded: true,
                toolName: "queryDatabase",
              },
            ],
          }),
          { config },
        ),
      ).toMatchObject({ pass: false });
    }
  });

  it("accepts repeated database results when each result is complete", () => {
    const queryResult = {
      input: {
        sql: "SELECT SUM(amount) AS income FROM transactions WHERE group_id = :groupId AND date LIKE '2026-07%'",
      },
      output: {
        columns: ["income"],
        rowCount: 1,
        rows: [{ income: 313_235 }],
        truncated: false,
      },
      succeeded: true,
      toolName: "queryDatabase",
    };

    expect(
      assertFinanceChatOutput(output({ toolTrace: [queryResult, queryResult] }), {
        config: {
          databaseQuery: {
            expectedRowCount: 1,
            outputCells: [{ columnPattern: "income", value: "313235" }],
            sqlPatterns: ["transactions", ":groupId", "2026-07", "amount"],
          },
          expectedCharts: [],
          expectedTextLinks: [],
          expectedToolRoutes: [],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("accepts a documented substr date predicate", () => {
    expect(
      assertFinanceChatOutput(
        output({
          toolTrace: [
            {
              input: {
                sql: "SELECT SUM(amount) AS income FROM transactions WHERE group_id = :groupId AND substr(date, 1, 7) = '2026-07'",
              },
              output: {
                columns: ["income"],
                rowCount: 1,
                rows: [{ income: 313_235 }],
                truncated: false,
              },
              succeeded: true,
              toolName: "queryDatabase",
            },
          ],
        }),
        {
          config: {
            databaseQuery: {
              expectedRowCount: 1,
              outputCells: [{ columnPattern: "income", value: "313235" }],
              predicatePatterns: [
                ":groupId",
                "\\bsubstr\\s*\\(\\s*date\\s*,\\s*1\\s*,\\s*7\\s*\\)\\s*=",
              ],
              sqlPatterns: ["transactions", "2026-07", "amount"],
            },
            expectedCharts: [],
            expectedTextLinks: [],
            expectedToolRoutes: [],
          },
        },
      ),
    ).toMatchObject({ pass: true });
  });

  it("accepts complete evidence after an exploratory query", () => {
    const sql =
      "SELECT SUM(amount) AS income FROM transactions WHERE group_id = :groupId AND date LIKE '2026-07%'";
    const trace = (rows: Array<{ income: number }>, truncated: boolean) => ({
      input: { sql },
      output: { columns: ["income"], rowCount: rows.length, rows, truncated },
      succeeded: true,
      toolName: "queryDatabase",
    });

    expect(
      assertFinanceChatOutput(
        output({
          toolTrace: [trace([{ income: 1 }], true), trace([{ income: 313_235 }], false)],
        }),
        {
          config: {
            databaseQuery: {
              expectedRowCount: 1,
              outputCells: [{ columnPattern: "income", value: "313235" }],
              sqlPatterns: ["transactions", ":groupId", "2026-07", "amount"],
            },
            expectedCharts: [],
            expectedTextLinks: [],
            expectedToolRoutes: [],
          },
        },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          toolTrace: [
            ...Array.from({ length: 50 }, () => trace([{ income: 1 }], false)),
            trace([{ income: 313_235 }], false),
          ],
        }),
        {
          config: {
            databaseQuery: {
              expectedRowCount: 1,
              outputCells: [{ columnPattern: "income", value: "313235" }],
              sqlPatterns: ["transactions", ":groupId", "2026-07", "amount"],
            },
            expectedCharts: [],
            expectedTextLinks: [],
            expectedToolRoutes: [],
          },
        },
      ),
    ).toMatchObject({ pass: true });
  });

  it("rejects constant projections as finance evidence", () => {
    expect(
      assertFinanceChatOutput(
        output({
          toolTrace: [
            {
              input: {
                sql: "SELECT 313234 + 1 AS income FROM transactions WHERE group_id = :groupId AND date LIKE '2026-07%'",
              },
              output: {
                columns: ["income"],
                rowCount: 1,
                rows: [{ income: 313_235 }],
                truncated: false,
              },
              succeeded: true,
              toolName: "queryDatabase",
            },
          ],
        }),
        {
          config: {
            databaseQuery: {
              expectedRowCount: 1,
              outputCells: [{ columnPattern: "income", value: "313235" }],
              outputSqlPatterns: ["\\bsum\\s*\\(\\s*amount\\s*\\)\\s+as\\s+income\\b"],
              predicatePatterns: [":groupId", "\\bdate\\b\\s*like"],
              sqlPatterns: ["transactions", "amount"],
            },
            expectedCharts: [],
            expectedTextLinks: [],
            expectedToolRoutes: [],
          },
        },
      ),
    ).toMatchObject({ pass: false });
  });

  it("combines complementary complete query results", () => {
    const sql =
      "SELECT category, amount FROM transactions WHERE group_id = :groupId AND date LIKE '2026-07%'";
    const trace = (category: string, amount: number) => ({
      input: { sql },
      output: {
        columns: ["category", "amount"],
        rowCount: 1,
        rows: [{ category, amount }],
        truncated: false,
      },
      succeeded: true,
      toolName: "queryDatabase",
    });

    expect(
      assertFinanceChatOutput(
        output({
          toolTrace: [trace("食料品", 24_833), trace("外食", 12_214), trace("カフェ", 4_790)],
        }),
        {
          config: {
            databaseQuery: {
              expectedRowCount: 3,
              outputRows: [
                ["食料品", "24833"],
                ["外食", "12214"],
                ["カフェ", "4790"],
              ],
              sqlPatterns: ["transactions", ":groupId", "2026-07", "amount"],
            },
            expectedCharts: [],
            expectedTextLinks: [],
            expectedToolRoutes: [],
          },
        },
      ),
    ).toMatchObject({ pass: true });
  });

  it("requires an empty result from a period-scoped no-data query", () => {
    const config = {
      databaseQuery: {
        expectEmpty: true,
        sqlPatterns: [
          "\\btransactions\\b",
          ":groupId",
          "2027-01",
          "\\b(?:count\\s*\\(\\s*(?:\\*|1|(?:\\w+\\.)?id)\\s*\\)|sum\\s*\\(\\s*amount\\s*\\))",
        ],
      },
      expectedCharts: [],
      expectedTextLinks: [],
      expectedToolRoutes: [],
    };
    const trace = (sql: string, rows: Array<Record<string, unknown>>) => [
      {
        input: { sql },
        output: { columns: ["amount"], rowCount: rows.length, rows, truncated: false },
        succeeded: true,
        toolName: "queryDatabase",
      },
    ];

    expect(
      assertFinanceChatOutput(
        output({
          toolTrace: trace(
            "SELECT COUNT(*) AS count FROM transactions WHERE group_id = :groupId AND date LIKE '2026-07%'",
            [{ count: 0 }],
          ),
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          toolTrace: trace(
            "SELECT COUNT(*) AS count FROM transactions WHERE group_id = :groupId AND date LIKE '2027-01%'",
            [{ count: 1 }],
          ),
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          toolTrace: trace(
            "SELECT COUNT(*) AS count FROM transactions WHERE group_id = :groupId AND date LIKE '2027-01%'",
            [{ count: 0 }],
          ),
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          toolTrace: trace(
            "SELECT COUNT(id) FROM transactions WHERE group_id = :groupId AND date LIKE '2027-01%'",
            [{ "COUNT(id)": 0 }],
          ),
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          toolTrace: trace(
            "SELECT 0 AS count FROM transactions WHERE group_id = :groupId AND date LIKE '2027-01%'",
            [{ count: 0 }],
          ),
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          toolTrace: trace(
            "SELECT SUM(amount) FROM transactions WHERE group_id = :groupId AND date LIKE '2027-01%'",
            [{ "SUM(amount)": null }],
          ),
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          toolTrace: trace(
            "SELECT COUNT(*) FROM transactions WHERE group_id = :groupId AND date LIKE '2027-01%'",
            [{ "COUNT(*)": 0 }],
          ),
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          toolTrace: trace(
            "SELECT COUNT(*) AS 件数 FROM transactions WHERE group_id = :groupId AND date LIKE '2027-01%'",
            [{ 件数: 0 }],
          ),
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          text: "2027年1月の支出は0件ではありません。",
          toolTrace: trace(
            "SELECT COUNT(*) AS count FROM transactions WHERE group_id = :groupId AND date LIKE '2027-01%'",
            [{ count: 0 }],
          ),
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
  });

  it("checks forbidden internal terms only in the answer text", () => {
    const config = {
      expectedCharts: [],
      expectedTextLinks: [],
      expectedToolRoutes: [],
      forbiddenTextTerms: ["transactions", ":groupId"],
    };
    const toolTrace = [
      {
        input: { sql: "SELECT amount FROM transactions WHERE group_id = :groupId" },
        output: [],
        succeeded: true,
        toolName: "queryDatabase",
      },
    ];

    expect(assertFinanceChatOutput(output({ toolTrace }), { config })).toMatchObject({
      pass: true,
    });
    expect(
      assertFinanceChatOutput(output({ text: "transactionsを確認しました。", toolTrace }), {
        config,
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(output({ text: "FROM TRANSACTIONS を実行しました。", toolTrace }), {
        config,
      }),
    ).toMatchObject({ pass: false });
  });

  it("requires chart structure and order", () => {
    const charts = [
      {
        title: "2026年7月の食費",
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
              titleIncludes: ["2026年7月", "食費"],
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
          expectedCharts: [{ chartType: "pie", titleIncludes: ["2026年7月", "食費"] }],
          expectedTextLinks: [],
          expectedToolRoutes: [],
        },
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(output({ charts: [{ ...charts[0], title: "2025年6月の食費" }] }), {
        config: {
          expectedCharts: [{ chartType: "pie", titleIncludes: ["2026年7月", "食費"] }],
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
      assertFinanceChatOutput(output({ text: "支出は一万円ですが、明細はありません。" }), {
        config,
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(output({ text: "支出は１２３円ですが、明細はありません。" }), {
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
    for (const text of [
      "対象期間のデータはありません。合計100000です。",
      "対象期間のデータはありません。総額100000です。",
    ]) {
      expect(assertFinanceChatOutput(output({ text }), { config })).toMatchObject({ pass: false });
    }
  });

  it("checks no-data wording only in the answer text", () => {
    const config = {
      expectedCharts: [],
      expectedTextLinks: [],
      expectedTextPatterns: ["(データ|支出).*(ありません|記録されていません)"],
      expectedToolRoutes: [],
    };
    const toolTrace = [
      {
        input: { sql: "SELECT 1 -- データがありません" },
        output: {},
        succeeded: true,
        toolName: "queryDatabase",
      },
    ];

    expect(
      assertFinanceChatOutput(output({ text: "対象期間については回答を保留します。", toolTrace }), {
        config,
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(output({ text: "対象期間の支出は記録されていません。", toolTrace }), {
        config,
      }),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(output({ text: "## 対象期間の支出\n\nありません。", toolTrace }), {
        config,
      }),
    ).toMatchObject({ pass: true });
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
    for (const equivalentDate of ["2026年7月10日", "2026/07/10"]) {
      expect(
        assertFinanceChatOutput(output({ text: text.replaceAll("2026-07-10", equivalentDate) }), {
          config,
        }),
      ).toMatchObject({ pass: true });
    }
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
    expect(
      assertFinanceChatOutput(output({ text: `\`\`\`markdown\n${text}\n\`\`\`` }), {
        config,
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(output({ text: `~~~markdown\n${text}\n~~~` }), {
        config,
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          text: [
            "| 2026-07-10 | 東京ガス ガス代 | 3,435円 |",
            "| 2026-07-10 | 成城石井 | 3,152円 |",
            "| --- | --- | ---: |",
          ].join("\n"),
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
  });

  it("requires every Markdown link to match a route tool result", () => {
    const config = {
      expectedCharts: [],
      expectedRenderedLinks: ["/0/cf/2026-07"],
      expectedTextLinks: ["/0/cf/2026-07"],
      expectedToolRoutes: ["/0/cf/2026-07"],
    };

    expect(
      assertFinanceChatOutput(
        output({
          text: "[2026年7月の収支を確認](/0/cf/2026-07)",
          renderedLinks: ["/0/cf/2026-07"],
          toolRoutes: ["/0/cf/2026-07"],
          textLinks: ["/0/cf/2026-07"],
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          text: "パスは /0/cf/2026-07",
          toolRoutes: ["/0/cf/2026-07"],
          textLinks: ["/0/cf/2026-07"],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });

    expect(
      assertFinanceChatOutput(
        output({
          text: "[2026年7月の収支を確認](/0/cf/2026-07)",
          renderedLinks: ["/0/cf/2026-07"],
          textLinks: ["/0/cf/2026-07"],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
  });
});
