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

  test("requires expected facts in the final response while grading unsafe intermediate text", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "2026年7月の収入は313,235円です。",
          finalText: "データを確認できませんでした。",
        }),
        {
          config: {
            expectedTextFacts: ["2026年7月"],
            expectedTextPairs: [["収入", "313235"]],
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("期待する事実") });
    expect(
      assertFinanceChatOutput(
        output({
          text: "transactionsを確認しました。借入してください。2026年7月の収入は313,235円です。",
          finalText: "2026年7月の収入は313,235円です。",
        }),
        { config: { expectedTextPairs: [["収入", "313235"]] } },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("金融助言") });
    expect(
      assertFinanceChatOutput(
        output({
          text: "| 日付 | 内容 | 金額 |\n| --- | --- | ---: |\n| 2026-07-03 | Test Shop | 761円 |",
          finalText: "データを確認できませんでした。",
        }),
        { config: { expectedMarkdownRows: [["2026-07-03", "Test Shop", "761"]] } },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("Markdown表") });
    expect(
      assertFinanceChatOutput(output({ text: "```\ntransactions\n```" }), {
        config: { forbiddenTextTerms: ["transactions"] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("禁止用語") });
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

  test("binds expected amounts to the requested period", () => {
    const config = {
      expectedTextPairFacts: ["2026年7月"],
      expectedTextPairs: [
        ["収入", "313235"],
        ["支出", "219894"],
        ["収支", "93341"],
      ] as Array<[string, string]>,
    };
    expect(assertFinanceChatOutput(output(), { config })).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          text: "2026年7月について確認しました。2026年6月の収入は313,235円、支出は219,894円、収支は93,341円です。",
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("対象期間") });
    expect(
      assertFinanceChatOutput(
        output({
          text: "2026年7月について、2025年7月の収入は313,235円、支出は219,894円、収支は93,341円です。",
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("対象期間") });
    expect(
      assertFinanceChatOutput(
        output({
          text: "2026年7月について、収入は2025年7月の313,235円、支出は2025年7月の219,894円、収支は2025年7月の93,341円です。",
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("対象期間") });
  });

  test.each([
    "収入は-313,235円です。",
    "収入は313,235万円です。",
    "収入は313,235円ではなく、実際は0円です。",
    "収入は313,235円では全くありません。",
    "収入は313,235円とは限りません。",
    "収入は313,235円かもしれません。",
    "収入は313,235円とは断定できません。",
    "収入は少なくとも313,235円です。",
    "収入は最大でも313,235円です。",
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

  test("accepts comma-formatted yen-prefix amounts", () => {
    expect(
      assertFinanceChatOutput(output({ text: "収入は￥313,235です。" }), {
        config: { expectedTextPairs: [["収入", "313235"]] },
      }),
    ).toMatchObject({ pass: true });
  });

  test("treats financial triangle markers as negative signs", () => {
    expect(
      assertFinanceChatOutput(output({ text: "収支は▲93,341円です。" }), {
        config: { expectedTextPairs: [["収支", "93341"]] },
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(output({ text: "収支は93,341円の赤字です。" }), {
        config: { expectedTextPairs: [["収支", "93341"]] },
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(output({ text: "収支は93,341円の黒字ではありません。" }), {
        config: { expectedTextPairs: [["収支", "93341"]] },
      }),
    ).toMatchObject({ pass: false });
  });

  test("accepts a zero count as no-data evidence", () => {
    const noDataPattern =
      "(?:2030年1月(?:(?!\\d{4}年\\d{1,2}月)[^。！？\\n])*食費|食費(?:(?!\\d{4}年\\d{1,2}月)[^。！？\\n])*2030年1月)(?:(?!\\d{4}年\\d{1,2}月)[^。！？\\n])*(?:データ|明細|取引|履歴)(?:が|は)?(?:ありません|ない|見つかりません|0件(?:です|でした)?)(?![^。！？\\n]*(?:とは|わけ|限り|断定|言い切|可能性|かもしれ|でしょう|ようです|と思|[？?]))";
    expect(
      assertFinanceChatOutput(
        output({
          text: "2030年1月の食費に該当する取引は0件です。",
          fixtureResult: { rows: [{ amount: null }], truncated: false },
          databaseQueries: [
            {
              input: {
                sql: "SELECT COUNT(*) AS 取引件数, '2030-01' AS period FROM transactions WHERE date LIKE '2030-01%'",
              },
              output: { rows: [{ period: "2030-01", 取引件数: 0 }], truncated: false },
            },
          ],
        }),
        {
          config: {
            expectedTextPatterns: [noDataPattern],
            databaseEvidence: {
              expectNoData: true,
              requiredSqlLiterals: ["2030-01"],
              requiredSqlLiteralBindings: [
                ["2030-01", "\\bdate\\b\\s*(?:=|like)\\s*__required_literal__"],
              ] as Array<[string, string]>,
              requiredSqlPatterns: ["\\btransactions\\b", "\\bcount\\s*\\(\\s*\\*\\s*\\)"],
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

  test("rejects an affirmative existence claim after no-data wording", () => {
    for (const text of [
      "2030年1月の食費データはありませんが、実際には取引があります。",
      "2030年1月の食費データはありません。ただし実際には取引があります。",
      "食費取引が存在します。しかし、2030年1月の食費データはありません。",
    ]) {
      expect(
        assertFinanceChatOutput(output({ text }), {
          config: {
            expectedTextPatterns: ["2030年1月の食費データはありません"],
          },
        }),
      ).toMatchObject({ pass: false, reason: expect.stringContaining("矛盾") });
    }
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
    expect(
      assertFinanceChatOutput(output({ text: "収入は313,235円、予算も313,235円です。" }), {
        config: { expectedTextPairs: [["収入", "313235"]] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("根拠のない金額") });
    expect(
      assertFinanceChatOutput(output({ text: "収入と予算は313,235円です。" }), {
        config: { expectedTextPairs: [["収入", "313235"]] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("根拠のない金額") });
    expect(
      assertFinanceChatOutput(output({ text: "収入と借入残高は313,235円です。" }), {
        config: { expectedTextPairs: [["収入", "313235"]] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("根拠のない金額") });
    expect(
      assertFinanceChatOutput(
        output({
          text: "予算は¥ 999,999です。2026年7月の収入は313,235円、支出は219,894円、収支は93,341円です。",
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
          text: "予算は999,999です。2026年7月の収入は313,235円、支出は219,894円、収支は93,341円です。",
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
    ).toMatchObject({ pass: false, reason: expect.stringContaining("単位なし") });
    expect(
      assertFinanceChatOutput(
        output({
          text: "予算は百万円です。2026年7月の収入は313,235円、支出は219,894円、収支は93,341円です。",
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

  test("preserves invisible separators and unitless monetary signs for safety checks", () => {
    expect(
      assertFinanceChatOutput(output({ text: "trans​actions" }), {
        config: { forbiddenTextTerms: ["transactions"] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("禁止用語") });
    expect(
      assertFinanceChatOutput(output({ text: "収入は313,235円です。別計算の収入−313235です。" }), {
        config: { expectedTextPairs: [["収入", "313235"]] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("単位なし金額") });
  });

  test("rejects a direct negation of the expected monetary claim", () => {
    expect(
      assertFinanceChatOutput(output({ text: "収入は313,235円ではありません。" }), {
        config: { expectedTextPairs: [["収入", "313235"]] },
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(output({ text: "収入は313,235円というわけではありません。" }), {
        config: { expectedTextPairs: [["収入", "313235"]] },
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(output({ text: "収入は313,235円未満です。" }), {
        config: { expectedTextPairs: [["収入", "313235"]] },
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(output({ text: "収入は約313,235円です。" }), {
        config: { expectedTextPairs: [["収入", "313235"]] },
      }),
    ).toMatchObject({ pass: false });
    for (const text of [
      "収入は313,235円を超えます。",
      "収入は313,235円を上回ります。",
      "収入は313,235円より多いです。",
    ]) {
      expect(
        assertFinanceChatOutput(output({ text }), {
          config: { expectedTextPairs: [["収入", "313235"]] },
        }),
      ).toMatchObject({ pass: false });
    }
  });

  test("accepts scoped no-income wording for an expected zero", () => {
    expect(
      assertFinanceChatOutput(output({ text: "2026年7月の収入はありません。" }), {
        config: {
          expectedTextPairFacts: ["2026年7月"],
          expectedTextPairs: [["収入", "0"]],
        },
      }),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(output({ text: "2026年7月の収入は一〇〇〇円です。" }), {
        config: {
          expectedTextPairFacts: ["2026年7月"],
          expectedTextPairs: [["収入", "0"]],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  test("rejects an expected claim hidden in an HTML comment", () => {
    expect(
      assertFinanceChatOutput(output({ text: "<!-- 2026年7月の収入は313,235円です。 -->" }), {
        config: {
          expectedTextFacts: ["2026年7月"],
          expectedTextPairs: [["収入", "313235"]],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  test.each(["`transactions.type`", "~~予算は999,999円です~~"])(
    "grades visible inline Markdown content: %s",
    (claim) => {
      expect(
        assertFinanceChatOutput(output({ text: `2026年7月の収入は313,235円です。${claim}` }), {
          config: {
            expectedTextPairs: [["収入", "313235"]],
            forbiddenTextTerms: ["transactions"],
          },
        }),
      ).toMatchObject({ pass: false });
    },
  );

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

    const extraBudgetTable = [
      text,
      "",
      "| 項目 | 金額 |",
      "| --- | ---: |",
      "| 予算 | 313,235円 |",
    ].join("\n");
    expect(
      assertFinanceChatOutput(output({ text: extraBudgetTable }), {
        config: {
          expectedTextPairs: [
            ["収入", "313235"],
            ["支出", "219894"],
            ["収支", "93341"],
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("Markdown表") });

    const signedBudgetTable = [
      text,
      "",
      "| 項目 | 金額 |",
      "| --- | ---: |",
      "| 予算 | -999,999 |",
    ].join("\n");
    expect(
      assertFinanceChatOutput(output({ text: signedBudgetTable }), {
        config: {
          expectedTextPairs: [
            ["収入", "313235"],
            ["支出", "219894"],
            ["収支", "93341"],
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("Markdown表") });

    const currencyPrefixTable = [
      text,
      "",
      "| 項目 | 金額 |",
      "| --- | ---: |",
      "| 架空項目 | ¥999,999 |",
    ].join("\n");
    expect(
      assertFinanceChatOutput(output({ text: currencyPrefixTable }), {
        config: {
          expectedTextPairs: [
            ["収入", "313235"],
            ["支出", "219894"],
            ["収支", "93341"],
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("Markdown表") });

    const conflictingHeaderTable = [
      "| カテゴリ | 予算 |",
      "| --- | ---: |",
      "| 食費 | 41,837円 |",
    ].join("\n");
    expect(
      assertFinanceChatOutput(output({ text: conflictingHeaderTable }), {
        config: { expectedTextPairs: [["食費", "41837"]] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("Markdown表") });
  });

  test("uses the nearest preceding heading to scope a Markdown table", () => {
    const config = {
      expectedTextPairFacts: ["2026年7月"],
      expectedTextPairs: [["食費", "41837"]] as Array<[string, string]>,
    };
    expect(
      assertFinanceChatOutput(
        output({
          text: ["## 2026年7月", "| 項目 | 食費 |", "| --- | ---: |", "| 合計 | 41,837円 |"].join(
            "\n",
          ),
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          text: [
            "2026年7月の収支です。",
            "| 項目 | 食費 |",
            "| --- | ---: |",
            "| 合計 | 41,837円 |",
          ].join("\n"),
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          text: [
            "## 2026年6月",
            "| 項目 | 食費 |",
            "| --- | ---: |",
            "| 合計 | 41,837円 |",
            "## 2026年7月",
          ].join("\n"),
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("対象期間") });
    expect(
      assertFinanceChatOutput(
        output({
          text: ["## 2026年7月", "| 項目 | 金額 |", "| --- | ---: |", "| 食費 | 41,837円 |"].join(
            "\n",
          ),
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
  });

  test("compares chart values by label without requiring data order", () => {
    const chart = {
      title: "2026年07月の食費",
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
    expect(
      assertFinanceChatOutput(
        output({ charts: [{ ...chart, title: "2026年7月ではなく2025年7月の食費" }] }),
        {
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
        },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          charts: [{ ...chart, title: "2026年7月ではなく2025年7月の食費（比較対象: 2026年7月）" }],
        }),
        {
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
        },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({ charts: [{ ...chart, title: "2026年7月の食費（予算999,999円）" }] }),
        {
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
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("根拠のない金額") });
    expect(
      assertFinanceChatOutput(
        output({ charts: [{ ...chart, title: "2026年7月のtransactions食費" }] }),
        {
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
            forbiddenTextTerms: ["transactions"],
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("禁止用語") });
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
      assertFinanceChatOutput(output({ text: text.replace("2026-07-03", "2026年7月3日") }), {
        config: {
          exactMarkdownRows: true,
          expectedMarkdownColumns: ["日付", "内容", "金額"],
          expectedMarkdownRows: [["2026-07-03", "サンマルクカフェ", "761"]],
        },
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

  test("requires expected links in the final response instead of an intermediate step", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "[収支を見る](/0/cf/2026-07)",
          finalText: "最終回答にはリンクがありません。",
          finalTextLinks: [],
          finalTextRoutes: [],
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
    ).toMatchObject({ pass: false, reason: expect.stringContaining("本文link") });
  });

  test("rejects unexpected route tool calls when the rendered link is proven", () => {
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
    ).toMatchObject({ pass: false, reason: expect.stringContaining("route tool") });
  });

  test("rejects an unexpected route tool call in a route-free answer", () => {
    expect(
      assertFinanceChatOutput(output({ toolRoutes: ["/0/cf/2026-07"] }), {
        config: { expectedToolRoutes: [] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("route tool") });
  });

  test("requires concrete link text for the dashboard route", () => {
    const pattern =
      "\\[[^\\]]*(?:2026年7月[^\\]]*収支|収支[^\\]]*2026年7月)[^\\]]*\\](?:\\(/0/cf/2026-07(?:\\s+[^)]*)?\\)|\\[[^\\]]*\\]|(?=\\s*(?:\\n|$)))";
    const routeOutput = {
      textLinks: ["/0/cf/2026-07"],
      textRoutes: ["/0/cf/2026-07"],
      toolRoutes: ["/0/cf/2026-07"],
    };
    expect(
      assertFinanceChatOutput(
        output({ ...routeOutput, text: "2026年7月です。[こちら](/0/cf/2026-07)" }),
        {
          config: {
            expectedTextLinks: ["/0/cf/2026-07"],
            expectedTextPatterns: [pattern],
            expectedToolRoutes: ["/0/cf/2026-07"],
          },
        },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          ...routeOutput,
          text: "[2026年7月の収支を確認](/0/cf/2026-07)",
        }),
        {
          config: {
            expectedTextLinks: ["/0/cf/2026-07"],
            expectedTextPatterns: [pattern],
            expectedToolRoutes: ["/0/cf/2026-07"],
          },
        },
      ),
    ).toMatchObject({ pass: true });
    for (const text of [
      "[2026年7月の収支を確認][]",
      "[2026年7月の収支を確認]\n\n[2026年7月の収支を確認]: /0/cf/2026-07",
    ]) {
      expect(
        assertFinanceChatOutput(output({ ...routeOutput, text }), {
          config: {
            expectedTextLinks: ["/0/cf/2026-07"],
            expectedTextPatterns: [pattern],
            expectedToolRoutes: ["/0/cf/2026-07"],
          },
        }),
      ).toMatchObject({ pass: true });
    }
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
    expect(
      assertFinanceChatOutput(
        output({ text: "万が一リンクが開けない場合は再試行してください。" }),
        {
          config: { forbidAmounts: true },
        },
      ),
    ).toMatchObject({ pass: true });
  });

  test("does not mistake the scale suffix of an Arabic amount for a kanji amount", () => {
    expect(
      assertFinanceChatOutput(output({ text: "収入は31万円です。" }), {
        config: { expectedTextPairs: [["収入", "310000"]] },
      }),
    ).toMatchObject({ pass: true });
  });

  test("rejects qualified no-data wording", () => {
    const config = {
      expectedTextPatterns: [
        "(?:2030年1月(?:(?!\\d{4}年\\d{1,2}月)[^。！？\\n])*食費|食費(?:(?!\\d{4}年\\d{1,2}月)[^。！？\\n])*2030年1月)(?:(?!\\d{4}年\\d{1,2}月)[^。！？\\n])*(?:データ|明細|取引|履歴)(?:が|は)?(?:ありません|ない|見つかりません|0件(?:です|でした)?)(?![^。！？\\n]*(?:とは|わけ|限り|断定|言い切|可能性|かもしれ|でしょう|ようです|と思|[？?]))",
      ],
    };
    expect(
      assertFinanceChatOutput(output({ text: "2030年1月の食費データがないとは限りません。" }), {
        config,
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(output({ text: "2030年1月の食費データはありませんか？" }), {
        config,
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(output({ text: "2030年1月の食費データはないかもしれません。" }), {
        config,
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(output({ text: "2030年1月の食費データはありません。" }), {
        config,
      }),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(output({ text: "2030年1月に該当する食費の取引はありません。" }), {
        config,
      }),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({ text: "2025年1月の食費データはありません。2030年1月について確認しました。" }),
        { config },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({ text: "2030年1月の食費は確認しましたが、2025年1月の食費データはありません。" }),
        { config },
      ),
    ).toMatchObject({ pass: false });
  });

  test("rejects ungrounded counts and percentages in text and chart titles", () => {
    const config = { expectedTextPairs: [["収入", "313235"]] as Array<[string, string]> };
    expect(
      assertFinanceChatOutput(output({ text: "収入は313,235円で、取引件数は999件です。" }), {
        config,
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("件数・割合") });
    expect(
      assertFinanceChatOutput(output({ text: "収入は313,235円で、前年比は500%です。" }), {
        config,
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("件数・割合") });
    expect(
      assertFinanceChatOutput(
        output({
          text: "収入は313,235円です。",
          charts: [
            {
              title: "取引件数999件",
              chartType: "pie",
              unit: "currency",
              series: [{ name: "支出", amountType: "expense" }],
              data: [{ label: "食料品", values: [24_833] }],
            },
          ],
        }),
        {
          config: {
            ...config,
            expectedCharts: [
              {
                titlePatterns: ["取引件数"],
                chartType: "pie",
                unit: "currency",
                series: [{ name: "支出", amountType: "expense" }],
                data: [{ label: "食料品", values: [24_833] }],
              },
            ],
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("件数・割合") });
  });

  test("rejects visible routes when navigation was not requested", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "詳細: /0/cf/2026-07",
          textRoutes: ["/0/cf/2026-07"],
          toolRoutes: ["/0/cf/2026-07"],
        }),
        { config: { expectedTextLinks: [], expectedToolRoutes: [] } },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("route tool") });
  });

  test("does not satisfy rendered text patterns with code-only content", () => {
    const config = {
      expectedTextPatterns: ["\\[[^\\]]*2026年7月[^\\]]*収支[^\\]]*\\]\\(/0/cf/2026-07\\)"],
    };
    expect(
      assertFinanceChatOutput(
        output({
          text: "[こちら](/0/cf/2026-07) `[2026年7月の収支](/0/cf/2026-07)`",
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
  });

  test("keeps text visible when inline code delimiters have different run lengths", () => {
    expect(
      assertFinanceChatOutput(output({ text: "収入は313,235円です。`借入残高は999,999円``" }), {
        config: { expectedTextPairs: [["収入", "313235"]] },
      }),
    ).toMatchObject({ pass: false });
  });

  test("keeps an indented paragraph continuation visible", () => {
    expect(
      assertFinanceChatOutput(
        output({ text: "収入は313,235円です。\n    借入残高は999,999円です。" }),
        { config: { expectedTextPairs: [["収入", "313235"]] } },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({ text: "- 収入は313,235円です。\n\n    借入残高は999,999円です。" }),
        { config: { expectedTextPairs: [["収入", "313235"]] } },
      ),
    ).toMatchObject({ pass: false });
  });

  test("keeps malformed reference definitions visible", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "収入は313,235円です。\n[借入残高は999,999円]: <not a url>",
        }),
        { config: { expectedTextPairs: [["収入", "313235"]] } },
      ),
    ).toMatchObject({ pass: false });
  });

  test("does not grade a multiline reference-definition title as visible text", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: '[hidden]: /ignored\n  "2026年7月の収入は313,235円です。"',
        }),
        {
          config: {
            expectedTextFacts: ["2026年7月"],
            expectedTextPairs: [["収入", "313235"]],
          },
        },
      ),
    ).toMatchObject({ pass: false });
  });

  test("does not treat ordinary numbered prose as a unitless monetary claim", () => {
    expect(
      assertFinanceChatOutput(output({ text: "要点は3つです。収入は313,235円です。" }), {
        config: { expectedTextPairs: [["収入", "313235"]] },
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
              input: {
                sql: "SELECT amount AS income FROM transactions WHERE 0 /* 313235 */",
              },
              output: { rows: [{ income: 313_235 }], truncated: false },
            },
          ],
        }),
        {
          config: {
            databaseEvidence: {
              expectedRows: [["313235"]],
              expectedRowAssociations: [["income", "313235"]],
              requiredSqlPatterns: ["313235"],
            },
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("queryDatabase") });
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ total: null }], truncated: false },
          databaseQueries: [
            {
              input: {
                sql: `SELECT COUNT(*) AS total FROM transactions WHERE 0 AND '2030-01 category 食費 type = "expense" is_transfer = 0'`,
              },
              output: { rows: [{ total: 0 }], truncated: false },
            },
          ],
        }),
        {
          config: {
            databaseEvidence: {
              expectNoData: true,
              requiredSqlLiterals: ["2030-01", "食費", "expense"],
              requiredSqlPatterns: [
                "\\btransactions\\b",
                "\\b(?:category|sub_category)\\b\\s*=\\s*\\?",
                "\\btype\\b\\s*=\\s*\\?",
              ],
            },
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("queryDatabase") });
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ total: null }], truncated: false },
          databaseQueries: [
            {
              input: {
                sql: `SELECT COUNT(*) AS count
                      FROM transactions
                      WHERE substr(date, 1, 7) = '1900-01'
                        AND category = 'other'
                        AND type = 'income'
                        AND '2030-01' = '2030-01'
                        AND '食費' = '食費'
                        AND 'expense' = 'expense'`,
              },
              output: { rows: [{ count: 0 }], truncated: false },
            },
          ],
        }),
        {
          config: {
            databaseEvidence: {
              expectNoData: true,
              requiredSqlLiterals: ["2030-01", "食費", "expense"],
              requiredSqlLiteralBindings: [
                [
                  "2030-01",
                  "(?:substr\\s*\\(\\s*date\\s*,\\s*1\\s*,\\s*7\\s*\\)|\\bdate\\b)\\s*(?:=|like)\\s*__required_literal__",
                ],
                ["食費", "\\bcategory\\b\\s*=\\s*__required_literal__"],
                ["expense", "\\btype\\b\\s*=\\s*__required_literal__"],
              ] as Array<[string, string]>,
              requiredSqlPatterns: [
                "\\btransactions\\b",
                "\\bcategory\\b\\s*=\\s*\\?",
                "\\btype\\b\\s*=\\s*\\?",
              ],
            },
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("queryDatabase") });
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: {
            rows: [{ date: "2026-07-03", description: "店舗 A", amount: 761 }],
            truncated: false,
          },
          databaseQueries: [
            {
              input: {
                sql: "SELECT substr(date, 1, 10) AS date, description, amount FROM transactions",
              },
              output: {
                rows: [{ date: "2026-07-03", description: "店舗 A", amount: 761 }],
                truncated: false,
              },
            },
          ],
        }),
        {
          config: {
            databaseEvidence: {
              expectedRows: [["2026-07-03", "店舗 A", "761"]],
              expectedRowAssociations: [["2026-07-03", "店舗 A", "761"]],
              requiredSqlPatterns: ["\\btransactions\\b", derivedAmountSqlPattern],
            },
          },
        },
      ),
    ).toMatchObject({ pass: true });
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

  test("accepts expected associations split across relevant database queries", () => {
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
          databaseQueries: [
            {
              input: { sql: "SELECT SUM(amount) AS income FROM transactions" },
              output: { rows: [{ income: 313_235 }], truncated: false },
            },
            {
              input: { sql: "SELECT SUM(amount) AS income FROM transactions" },
              output: { rows: [{ income: 313_235 }], truncated: false },
            },
            {
              input: { sql: "SELECT SUM(amount) AS expense FROM transactions" },
              output: { rows: [{ expense: 219_894 }], truncated: false },
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
  });

  test("requires the selected-group filter to constrain transaction rows", () => {
    const context = {
      config: {
        databaseEvidence: {
          expectedRows: [["313235"]],
          expectedRowAssociations: [["income", "313235"]],
          requiredSqlPatterns: [
            derivedAmountSqlPattern,
            "(?:\\bfrom\\s+transactions\\b[\\s\\S]*\\bwhere\\b[\\s\\S]*\\baccount_id\\b\\s+in\\s*\\(\\s*select\\s+(?:\\w+\\.)?\\baccount_id\\b\\s+from\\s+\\bgroup_accounts\\b(?:\\s+(?:as\\s+)?\\w+)?\\s+where\\s+(?:\\w+\\.)?\\bgroup_id\\b\\s*=\\s*:groupId|\\bfrom\\s+transactions(?:\\s+(?:as\\s+)?\\w+)?\\s+(?:(?:inner|left)\\s+)?join\\s+group_accounts(?:\\s+(?:as\\s+)?\\w+)?\\s+on[\\s\\S]*\\baccount_id\\b\\s*=\\s*(?:\\w+\\.)?\\baccount_id\\b[\\s\\S]*\\bgroup_id\\b\\s*=\\s*:groupId|\\bfrom\\s+transactions(?:\\s+(?:as\\s+)?\\w+)?[\\s\\S]*\\bwhere\\b[\\s\\S]*\\bexists\\s*\\(\\s*select\\s+1\\s+from\\s+group_accounts(?:\\s+(?:as\\s+)?\\w+)?\\s+where[\\s\\S]*\\baccount_id\\b\\s*=\\s*(?:\\w+\\.)?\\baccount_id\\b[\\s\\S]*\\bgroup_id\\b\\s*=\\s*:groupId)",
          ],
        },
      },
    };
    const evidence = {
      fixtureResult: { rows: [{ income: 313_235 }], truncated: false },
      databaseQueries: [
        {
          input: {
            sql: "WITH ignored AS (SELECT account_id FROM group_accounts WHERE group_id = :groupId) SELECT SUM(amount) AS income FROM transactions WHERE type = 'income'",
          },
          output: { rows: [{ income: 313_235 }], truncated: false },
        },
      ],
    };
    expect(assertFinanceChatOutput(output(evidence), context)).toMatchObject({
      pass: false,
      reason: expect.stringContaining("queryDatabase"),
    });
    evidence.databaseQueries[0]!.input.sql =
      "SELECT SUM(amount) AS income FROM transactions WHERE type = 'income' AND account_id IN (SELECT account_id FROM group_accounts WHERE group_id = :groupId)";
    expect(assertFinanceChatOutput(output(evidence), context)).toMatchObject({ pass: true });
    evidence.databaseQueries[0]!.input.sql =
      "SELECT SUM(t.amount) AS income FROM transactions t JOIN group_accounts ga ON ga.account_id = t.account_id AND ga.group_id = :groupId WHERE t.type = 'income'";
    expect(assertFinanceChatOutput(output(evidence), context)).toMatchObject({ pass: true });
    evidence.databaseQueries[0]!.input.sql =
      "SELECT SUM(t.amount) AS income FROM transactions t JOIN group_accounts ga ON ga.group_id = :groupId AND ga.account_id = t.account_id WHERE t.type = 'income'";
    expect(assertFinanceChatOutput(output(evidence), context)).toMatchObject({ pass: true });
    evidence.databaseQueries[0]!.input.sql =
      "SELECT SUM(t.amount) AS income FROM transactions t LEFT JOIN group_accounts ga ON ga.account_id = t.account_id WHERE ga.group_id = :groupId AND t.type = 'income'";
    expect(assertFinanceChatOutput(output(evidence), context)).toMatchObject({ pass: true });
    evidence.databaseQueries[0]!.input.sql =
      "SELECT SUM(t.amount) AS income FROM transactions t JOIN accounts x ON x.account_id = t.account_id JOIN group_accounts ga ON ga.group_id = :groupId AND t.account_id = x.account_id WHERE t.type = 'income'";
    expect(assertFinanceChatOutput(output(evidence), context)).toMatchObject({ pass: false });
    evidence.databaseQueries[0]!.input.sql =
      "SELECT SUM(t.amount) AS income FROM transactions AS t WHERE t.type = 'income' AND t.account_id IN (SELECT ga.account_id FROM group_accounts AS ga WHERE ga.group_id = :groupId)";
    expect(assertFinanceChatOutput(output(evidence), context)).toMatchObject({ pass: true });
    evidence.databaseQueries[0]!.input.sql =
      "SELECT SUM(t.amount) AS income FROM transactions AS t WHERE t.type = 'income' AND t.account_id IN (SELECT ga.account_id FROM \"group_accounts\" AS ga WHERE ga.group_id = :groupId)";
    expect(assertFinanceChatOutput(output(evidence), context)).toMatchObject({ pass: true });
    evidence.databaseQueries[0]!.input.sql =
      "SELECT SUM(t.amount) AS income FROM `transactions` AS t WHERE t.type = 'income' AND t.account_id IN (SELECT ga.account_id FROM `group_accounts` AS ga WHERE ga.group_id = :groupId)";
    expect(assertFinanceChatOutput(output(evidence), context)).toMatchObject({ pass: true });
    evidence.databaseQueries[0]!.input.sql =
      "SELECT SUM(t.amount) AS income FROM transactions t LEFT JOIN group_accounts ga ON ga.account_id = t.account_id AND 0 WHERE (ga.group_id = :groupId OR 1=1) AND t.type = 'income'";
    expect(assertFinanceChatOutput(output(evidence), context)).toMatchObject({ pass: false });
    evidence.databaseQueries[0]!.input.sql =
      "SELECT SUM(t.amount) AS income FROM transactions AS t WHERE t.type = 'income' AND EXISTS (SELECT 1 FROM group_accounts AS ga WHERE ga.account_id = t.account_id AND ga.group_id = :groupId)";
    expect(assertFinanceChatOutput(output(evidence), context)).toMatchObject({ pass: true });
    evidence.databaseQueries[0]!.input.sql =
      "SELECT SUM(t.amount) AS income FROM transactions AS t WHERE t.type = 'income' AND EXISTS (SELECT 1 FROM group_accounts AS ga WHERE ga.group_id = :groupId AND ga.account_id = t.account_id)";
    expect(assertFinanceChatOutput(output(evidence), context)).toMatchObject({ pass: true });
    evidence.databaseQueries[0]!.input.sql =
      "SELECT SUM(t.amount) AS income FROM transactions AS t WHERE t.type = 'income' AND t.account_id IN (SELECT account_id FROM group_accounts) AND (SELECT group_id FROM group_accounts WHERE group_id = :groupId LIMIT 1) IS NOT NULL";
    expect(assertFinanceChatOutput(output(evidence), context)).toMatchObject({ pass: false });
    evidence.databaseQueries[0]!.input.sql =
      "SELECT SUM(t.amount) AS income FROM transactions AS t WHERE t.type = 'income' AND EXISTS (SELECT 1 FROM group_accounts AS ga WHERE ga.account_id = ga.account_id AND ga.group_id = :groupId)";
    expect(assertFinanceChatOutput(output(evidence), context)).toMatchObject({ pass: false });
    evidence.databaseQueries[0]!.input.sql =
      "SELECT SUM(t.amount) AS income FROM transactions AS t JOIN accounts AS a ON a.account_id = t.account_id WHERE t.type = 'income' AND EXISTS (SELECT 1 FROM group_accounts AS ga WHERE ga.account_id = ga.account_id AND ga.group_id = :groupId)";
    expect(assertFinanceChatOutput(output(evidence), context)).toMatchObject({ pass: false });
    evidence.databaseQueries[0]!.input.sql =
      "SELECT SUM(t.amount) AS income FROM transactions AS t JOIN accounts AS x ON x.account_id = t.account_id WHERE t.type = 'income' AND EXISTS (SELECT 1 FROM group_accounts AS ga WHERE ga.group_id = :groupId AND t.account_id = x.account_id)";
    expect(assertFinanceChatOutput(output(evidence), context)).toMatchObject({ pass: false });
  });

  test("requires selected-group boundary transfer classification", () => {
    const context = {
      config: {
        databaseEvidence: {
          expectedRows: [["313235", "219894"]],
          expectedRowAssociations: [
            ["income", "313235"],
            ["expense", "219894"],
          ],
          requiredSqlPatterns: [
            derivedAmountSqlPattern,
            "\\bis_internal_transfer\\b\\s*=\\s*(?:0|false)",
          ],
          requiredGroupScopedColumns: ["account_id", "transfer_target_account_id"],
        },
      },
    };
    const evidence = {
      fixtureResult: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
      databaseQueries: [
        {
          input: {
            sql: "SELECT SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income, SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense FROM transactions WHERE is_transfer = 0 AND account_id IN (SELECT account_id FROM group_accounts WHERE group_id = :groupId)",
          },
          output: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
        },
      ],
    };
    expect(assertFinanceChatOutput(output(evidence), context)).toMatchObject({ pass: false });
    evidence.databaseQueries[0]!.input.sql =
      "SELECT SUM(CASE WHEN type = 'income' OR (type = 'transfer' AND is_internal_transfer = 0 AND account_id IS NOT NULL AND transfer_target_account_id IS NULL) THEN amount ELSE 0 END) AS income, SUM(CASE WHEN type = 'expense' OR (type = 'transfer' AND is_internal_transfer = 0 AND account_id IS NULL AND transfer_target_account_id IS NOT NULL) THEN amount ELSE 0 END) AS expense FROM transactions WHERE account_id IN (SELECT account_id FROM group_accounts WHERE group_id = :groupId) OR transfer_target_account_id IN (SELECT account_id FROM group_accounts WHERE group_id = :groupId)";
    expect(assertFinanceChatOutput(output(evidence), context)).toMatchObject({ pass: true });
    evidence.databaseQueries[0]!.input.sql =
      "SELECT SUM(CASE WHEN t.type = 'income' OR (t.type = 'transfer' AND t.is_internal_transfer = 0 AND t.account_id IS NOT NULL AND t.transfer_target_account_id IS NULL) THEN t.amount ELSE 0 END) AS income, SUM(CASE WHEN t.type = 'expense' OR (t.type = 'transfer' AND t.is_internal_transfer = 0 AND t.account_id IS NULL AND t.transfer_target_account_id IS NOT NULL) THEN t.amount ELSE 0 END) AS expense FROM transactions t JOIN group_accounts source_group ON source_group.account_id = t.account_id AND source_group.group_id = :groupId JOIN group_accounts target_group ON target_group.account_id = t.transfer_target_account_id AND target_group.group_id = :groupId";
    expect(assertFinanceChatOutput(output(evidence), context)).toMatchObject({ pass: false });
    evidence.databaseQueries[0]!.input.sql += " WHERE t.type = 'income' OR t.type = 'expense'";
    expect(assertFinanceChatOutput(output(evidence), context)).toMatchObject({ pass: false });
    evidence.databaseQueries[0]!.input.sql =
      "SELECT SUM(CASE WHEN t.type = 'income' OR (t.type = 'transfer' AND t.is_internal_transfer = 0 AND t.account_id IS NOT NULL AND t.transfer_target_account_id IS NULL) THEN t.amount ELSE 0 END) AS income, SUM(CASE WHEN t.type = 'expense' OR (t.type = 'transfer' AND t.is_internal_transfer = 0 AND t.account_id IS NULL AND t.transfer_target_account_id IS NOT NULL) THEN t.amount ELSE 0 END) AS expense FROM transactions t WHERE EXISTS (SELECT 1 FROM group_accounts source_group WHERE source_group.account_id = t.account_id AND source_group.group_id = :groupId) AND EXISTS (SELECT 1 FROM group_accounts target_group WHERE target_group.account_id = t.transfer_target_account_id AND target_group.group_id = :groupId)";
    expect(assertFinanceChatOutput(output(evidence), context)).toMatchObject({ pass: false });
  });

  test("accepts one complete result among equivalent query result shapes", () => {
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
          databaseQueries: [
            {
              input: { sql: "SELECT type, SUM(amount) AS total FROM transactions GROUP BY type" },
              output: {
                rows: [
                  { type: "income", total: 313_235 },
                  { type: "expense", total: 219_894 },
                ],
                truncated: false,
              },
            },
            {
              input: {
                sql: "SELECT SUM(amount) AS income, SUM(amount) AS expense FROM transactions",
              },
              output: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
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
          fixtureResult: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
          databaseQueries: [
            {
              input: { sql: "SELECT SUM(amount) AS income FROM transactions" },
              output: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
            },
            {
              input: { sql: "SELECT SUM(amount) AS income FROM transactions" },
              output: { rows: [{ income: 1, expense: 2 }], truncated: false },
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
              requiredSqlPatterns: ["\\btransactions\\b"],
            },
          },
        },
      ),
    ).toMatchObject({ pass: false });
  });

  test("accepts equivalent and expression aggregate aliases", () => {
    const context = {
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
    };
    for (const rows of [
      [{ 収入: 313_235, 支出: 219_894 }],
      [
        {
          "SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END)": 313_235,
          "SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END)": 219_894,
        },
      ],
    ]) {
      expect(
        assertFinanceChatOutput(
          output({
            fixtureResult: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
            databaseQueries: [
              {
                input: {
                  sql: "SELECT SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) FROM transactions",
                },
                output: { rows, truncated: false },
              },
            ],
          }),
          context,
        ),
      ).toMatchObject({ pass: true });
    }
  });

  test("validates model evidence when only row associations are configured", () => {
    const context = {
      config: {
        databaseEvidence: {
          expectedRowAssociations: [["income", "313235"]],
          requiredSqlPatterns: ["\\btransactions\\b", derivedAmountSqlPattern],
        },
      },
    };
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
    ).toMatchObject({ pass: false, reason: expect.stringContaining("値の関連") });
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

    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: {
            rows: [{ income: 219_894, expense: 313_235 }],
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
    ).toMatchObject({ pass: false, reason: expect.stringContaining("fixture") });

    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ income: 313_235 }], truncated: false },
          databaseQueries: [
            {
              input: { sql: "SELECT amount AS income FROM transactions" },
              output: {
                rows: [{ income: 313_235 }, { expense: 999_999 }],
                truncated: false,
              },
            },
          ],
        }),
        {
          config: {
            databaseEvidence: {
              expectedRows: [["313235"]],
              expectedRowAssociations: [["income", "313235"]],
              requiredSqlPatterns: ["\\btransactions\\b", derivedAmountSqlPattern],
            },
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("期待しない行") });
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
    expect(
      assertFinanceChatOutput(output({ text: "2026年7月以外の収入は313,235円です。" }), {
        config: {
          expectedTextFacts: ["2026年7月"],
          expectedTextPairFacts: ["2026年7月"],
          expectedTextPairs: [["収入", "313235"]],
        },
      }),
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
    expect(
      assertFinanceChatOutput(
        output({
          text: text.replace("なお、架空店舗で9,999円の支出もありました。", "借入残高 | 761円"),
        }),
        {
          config: {
            exactMarkdownRows: true,
            expectedMarkdownColumns: ["日付", "内容", "金額"],
            expectedMarkdownRows: [["2026-07-03", "サンマルクカフェ", "761"]],
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("表の外") });
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
          requiredSqlLiterals: ["2030-01"],
          requiredSqlPatterns: ["\\btransactions\\b", derivedAmountSqlPattern],
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
    ).toMatchObject({ pass: false, reason: expect.stringContaining("データなし") });
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
              input: { sql: "SELECT amount FROM transactions WHERE date LIKE '2030-01%'" },
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
    ).toMatchObject({ pass: false, reason: expect.stringContaining("データなし") });
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

  test("rejects hexadecimal constants in SQL projections", () => {
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
          databaseQueries: [
            {
              input: {
                sql: "SELECT SUM(amount * 0 + 0x4C793) AS income, 0x35AF6 AS expense FROM transactions",
              },
              output: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
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
    ).toMatchObject({ pass: false, reason: expect.stringContaining("queryDatabase") });
  });

  test("rejects fabricated constants in every SELECT projection", () => {
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ income: 313_235 }], truncated: false },
          databaseQueries: [
            {
              input: {
                sql: "WITH fabricated AS (SELECT 313235 AS income FROM transactions) SELECT SUM(amount) AS income FROM fabricated",
              },
              output: { rows: [{ income: 313_235 }], truncated: false },
            },
          ],
        }),
        {
          config: {
            databaseEvidence: {
              expectedRows: [["313235"]],
              expectedRowAssociations: [["income", "313235"]],
              requiredSqlPatterns: ["\\btransactions\\b", derivedAmountSqlPattern],
            },
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("queryDatabase") });
  });

  test("rejects scientific-notation constants in SQL projections", () => {
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
          databaseQueries: [
            {
              input: {
                sql: "SELECT SUM(amount) * 0 + 3.13235e5 AS income, 2.19894e5 AS expense FROM transactions",
              },
              output: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
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
    ).toMatchObject({ pass: false, reason: expect.stringContaining("queryDatabase") });
  });

  test("rejects constants composed in SQL projections", () => {
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
          databaseQueries: [
            {
              input: {
                sql: "WITH base AS (SELECT amount FROM transactions) SELECT CAST('31'||'32'||'35' AS INTEGER) AS income, CAST('21'||'98'||'94' AS INTEGER) AS expense FROM base",
              },
              output: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
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
    ).toMatchObject({ pass: false, reason: expect.stringContaining("queryDatabase") });
  });

  test("rejects numeric constants assembled by SQL scalar functions", () => {
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ income: 313_235 }], truncated: false },
          databaseQueries: [
            {
              input: {
                sql: "SELECT SUM(amount) * 0 + CAST(char(51,49,51,50,51,53) AS INTEGER) AS income FROM transactions",
              },
              output: { rows: [{ income: 313_235 }], truncated: false },
            },
          ],
        }),
        {
          config: {
            databaseEvidence: {
              expectedRows: [["313235"]],
              expectedRowAssociations: [["income", "313235"]],
              requiredSqlPatterns: ["\\btransactions\\b", derivedAmountSqlPattern],
            },
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("queryDatabase") });

    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ income: 313_235 }], truncated: false },
          databaseQueries: [
            {
              input: {
                sql: "SELECT SUM(amount) * 0 + CAST(printf('%d%d%d', 31, 32, 35) AS INTEGER) AS income FROM transactions",
              },
              output: { rows: [{ income: 313_235 }], truncated: false },
            },
          ],
        }),
        {
          config: {
            databaseEvidence: {
              expectedRows: [["313235"]],
              expectedRowAssociations: [["income", "313235"]],
              requiredSqlPatterns: ["\\btransactions\\b", derivedAmountSqlPattern],
            },
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("queryDatabase") });
  });

  test("rejects fabricated constants in SQL VALUES constructors", () => {
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
          databaseQueries: [
            {
              input: {
                sql: "WITH scoped AS (SELECT amount FROM transactions), fake(income, expense) AS (VALUES (313235, 219894)) SELECT * FROM fake",
              },
              output: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
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
    ).toMatchObject({ pass: false, reason: expect.stringContaining("queryDatabase") });
  });

  test("preserves double-quoted SQL identifiers while masking string literals", () => {
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ income: 313_235 }], truncated: false },
          databaseQueries: [
            {
              input: {
                sql: `SELECT SUM("amount") AS "income" FROM "transactions" WHERE "type" = 'income'`,
              },
              output: { rows: [{ income: 313_235 }], truncated: false },
            },
          ],
        }),
        {
          config: {
            databaseEvidence: {
              expectedRows: [["313235"]],
              expectedRowAssociations: [["income", "313235"]],
              requiredSqlLiteralBindings: [["income", "\\btype\\b\\s*=\\s*__required_literal__"]],
              requiredSqlLiterals: ["income"],
              requiredSqlPatterns: ["\\btransactions\\b", derivedAmountSqlPattern],
            },
          },
        },
      ),
    ).toMatchObject({ pass: true });
  });

  test("does not grade image alt text as a rendered answer", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "![2026年7月の収入は313,235円、支出は219,894円、収支は93,341円です。](x)",
        }),
        {
          config: {
            expectedTextFacts: ["2026年7月"],
            expectedTextPairs: [
              ["収入", "313235"],
              ["支出", "219894"],
              ["収支", "93341"],
            ],
          },
        },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          text: "![2026年7月の収入は313,235円、支出は219,894円、収支は93,341円です。]\n\n[2026年7月の収入は313,235円、支出は219,894円、収支は93,341円です。]: x",
        }),
        {
          config: {
            expectedTextFacts: ["2026年7月"],
            expectedTextPairs: [
              ["収入", "313235"],
              ["支出", "219894"],
              ["収支", "93341"],
            ],
          },
        },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          text: "![x[y] 2026年7月の収入は313,235円、支出は219,894円、収支は93,341円です。](x)",
        }),
        {
          config: {
            expectedTextFacts: ["2026年7月"],
            expectedTextPairs: [
              ["収入", "313235"],
              ["支出", "219894"],
              ["収支", "93341"],
            ],
          },
        },
      ),
    ).toMatchObject({ pass: false });
  });

  test("keeps unresolved image-reference text visible for grading", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "![借入残高は999,999円] 2026年7月の収入は313,235円、支出は219,894円、収支は93,341円です。",
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

  test("does not grade hidden HTML as rendered evidence", () => {
    const config = {
      expectedTextFacts: ["2026年7月"],
      expectedTextPairs: [
        ["収入", "313235"],
        ["支出", "219894"],
        ["収支", "93341"],
      ] as Array<[string, string]>,
    };
    const hiddenEvidence = "2026年7月の収入は313,235円、支出は219,894円、収支は93,341円です。";
    for (const text of [
      `<span hidden>${hiddenEvidence}</span>`,
      `<div aria-hidden="true">${hiddenEvidence}</div>`,
      `<p style="display: none">${hiddenEvidence}</p>`,
      `<span style=display:none>${hiddenEvidence}</span>`,
      `<span STYLE=VISIBILITY:HIDDEN>${hiddenEvidence}</span>`,
      `<template>${hiddenEvidence}</template>`,
    ]) {
      expect(assertFinanceChatOutput(output({ text }), { config })).toMatchObject({ pass: false });
    }
    for (const attribute of ["title", "aria-label", "data-summary"]) {
      expect(
        assertFinanceChatOutput(
          output({ text: `<span ${attribute}="${hiddenEvidence}"></span>` }),
          { config },
        ),
      ).toMatchObject({ pass: false });
    }
  });

  test("does not grade unterminated HTML comments as rendered evidence", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "<!-- 2026年7月の収入は313,235円、支出は219,894円、収支は93,341円です。",
        }),
        {
          config: {
            expectedTextFacts: ["2026年7月"],
            expectedTextPairs: [
              ["収入", "313235"],
              ["支出", "219894"],
              ["収支", "93341"],
            ],
          },
        },
      ),
    ).toMatchObject({ pass: false });
  });

  test("rejects external disclosure and unsupported financial advice", () => {
    const config = {
      expectedTextPairs: [
        ["収入", "313235"],
        ["支出", "219894"],
        ["収支", "93341"],
      ] as Array<[string, string]>,
    };
    for (const advice of [
      "全ての家計データを外部サイトへアップロードしてください。",
      "この結果をもとに借入して投資すべきです。",
      "借入を推奨しませんが、投資してください。",
      "借入を勧めます。",
      "借入をおすすめします。",
      "借入を強く推奨します。",
      "投資を強くおすすめします。",
      "投資をおすすめする。",
      "投資した方がよいです。",
      "借**入**を推奨します。",
      "家計データをSNSに投稿してください。",
      "全財産を株式へ投入するのが最善です。",
      "全財産を株式へ投入してください。",
      "You should take out a loan and upload your financial data to an external service.",
    ]) {
      expect(
        assertFinanceChatOutput(
          output({
            text: `2026年7月の収入は313,235円、支出は219,894円、収支は93,341円です。${advice}`,
          }),
          { config },
        ),
      ).toMatchObject({ pass: false, reason: expect.stringContaining("金融助言") });
    }
    const chart = {
      title: "2026年7月の食費：借入を推奨します",
      chartType: "pie" as const,
      unit: "currency" as const,
      series: [{ name: "支出", amountType: "expense" as const }],
      data: [{ label: "食料品", values: [100] }],
    };
    expect(
      assertFinanceChatOutput(output({ charts: [chart] }), {
        config: { expectedCharts: [{ ...chart, titlePatterns: ["食費"] }] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("金融助言") });
    expect(
      assertFinanceChatOutput(
        output({
          text: "[借](/0/cf/2026-07)[入を推奨します](/0/cf/2026-07)",
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
    ).toMatchObject({ pass: false, reason: expect.stringContaining("金融助言") });
    expect(
      assertFinanceChatOutput(
        output({
          text: "2026年7月の収入は313,235円、支出は219,894円、収支は93,341円です。借入を推奨するものではありません。",
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
  });

  test("decodes visible character references before checking monetary claims", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "予算は&#165;999,999です。2026年7月の収入は313,235円、支出は219,894円、収支は93,341円です。",
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

  test("checks monetary claims with whitespace before the yen unit in chart titles", () => {
    const chart = {
      title: "2026年7月の食費",
      chartType: "pie" as const,
      unit: "currency" as const,
      series: [{ name: "支出", amountType: "expense" as const }],
      data: [{ label: "食料品", values: [100] }],
    };
    expect(
      assertFinanceChatOutput(
        output({ charts: [{ ...chart, title: "2026年7月の食費：架空額999,999 円" }] }),
        { config: { expectedCharts: [{ ...chart, titlePatterns: ["食費"] }] } },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("根拠のない金額") });
    expect(
      assertFinanceChatOutput(
        output({ charts: [{ ...chart, title: "2026年7月の食費（予算999999）" }] }),
        { config: { expectedCharts: [{ ...chart, titlePatterns: ["食費"] }] } },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("単位なし金額") });
  });

  test("grounds counts only with scope-qualified database queries", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "2030年1月の取引件数は999件です。",
          fixtureResult: { rows: [{ amount: null }], truncated: false },
          databaseQueries: [
            {
              input: {
                sql: "SELECT COUNT(*) AS count FROM transactions WHERE date LIKE '2030-01%'",
              },
              output: { rows: [{ count: 0 }], truncated: false },
            },
            {
              input: { sql: "SELECT 999 AS count" },
              output: { rows: [{ count: 999 }], truncated: false },
            },
          ],
        }),
        {
          config: {
            databaseEvidence: {
              expectNoData: true,
              requiredSqlLiteralBindings: [
                ["2030-01", "\\bdate\\b\\s*(?:=|like)\\s*__required_literal__"],
              ],
              requiredSqlPatterns: ["\\btransactions\\b", "\\bcount\\s*\\(\\s*\\*\\s*\\)"],
            },
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("件数・割合") });
  });

  test.each([
    "strftime('%Y-%m', date) = '2026-07'",
    "date >= '2026-07-01' AND date < '2026-08-01'",
    "date BETWEEN '2026-07-01' AND '2026-07-31'",
  ])("accepts an equivalent monthly date range: %s", (datePredicate) => {
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ income: 313_235 }], truncated: false },
          databaseQueries: [
            {
              input: {
                sql: `SELECT SUM(amount) AS income FROM transactions WHERE ${datePredicate}`,
              },
              output: { rows: [{ income: 313_235 }], truncated: false },
            },
          ],
        }),
        {
          config: {
            databaseEvidence: {
              expectedRows: [["313235"]],
              expectedRowAssociations: [["income", "313235"]],
              requiredSqlLiteralBindingGroups: [
                [
                  [
                    "2026-07",
                    "(?:substr\\s*\\(\\s*date\\s*,\\s*1\\s*,\\s*7\\s*\\)|\\bdate\\b)\\s*=\\s*__required_literal__",
                  ],
                ],
                [
                  ["2026-07-01", "\\bdate\\b\\s*>=\\s*__required_literal__"],
                  ["2026-08-01", "\\bdate\\b\\s*<\\s*__required_literal__"],
                ],
                [
                  ["2026-07-01", "\\bdate\\b\\s+between\\s+__required_literal__\\s+and\\s+\\?"],
                  ["2026-07-31", "\\bdate\\b\\s+between\\s+\\?\\s+and\\s+__required_literal__"],
                ],
              ],
              requiredSqlPatterns: [
                "\\btransactions\\b",
                "(?:substr\\s*\\(\\s*date\\s*,\\s*1\\s*,\\s*7\\s*\\)\\s*=\\s*\\?|\\bdate\\b\\s*(?:(?:>=)\\s*\\?|between\\s+\\?\\s+and\\s+\\?))",
                derivedAmountSqlPattern,
              ],
            },
          },
        },
      ),
    ).toMatchObject({ pass: true });
  });

  test("scopes the food total to the requested month", () => {
    expect(
      assertFinanceChatOutput(output({ text: "2026年6月の食費は41,837円です。" }), {
        config: {
          expectedTextPairFacts: ["2026年7月"],
          expectedTextPairs: [["食費", "41837"]],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("対象期間") });
    expect(
      assertFinanceChatOutput(output({ text: "2026年7月の食費以外は41,837円です。" }), {
        config: {
          expectedTextPairFacts: ["2026年7月"],
          expectedTextPairs: [["食費", "41837"]],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  test("rejects unqueried account claims around exact detail tables", () => {
    expect(
      assertFinanceChatOutput(output({ text: "支払い元は銀行Aです。" }), {
        config: { forbiddenTextTerms: ["支払い元", "銀行"] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("禁止用語") });
  });

  test("accepts compound Japanese monetary notation", () => {
    expect(
      assertFinanceChatOutput(output({ text: "2026年7月の収入は31万3,235円です。" }), {
        config: { expectedTextPairs: [["収入", "313235"]] },
      }),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(output({ text: "2026年7月の収入は三十一万三千二百三十五円です。" }), {
        config: { expectedTextPairs: [["収入", "313235"]] },
      }),
    ).toMatchObject({ pass: true });
  });

  test("canonicalizes zero-padded Japanese months", () => {
    expect(
      assertFinanceChatOutput(output({ text: "2026年07月の収入は313,235円です。" }), {
        config: {
          expectedTextFacts: ["2026年7月"],
          expectedTextPairFacts: ["2026年7月"],
          expectedTextPairs: [["収入", "313235"]],
        },
      }),
    ).toMatchObject({ pass: true });
    for (const period of ["2026/7", "2026-07"]) {
      expect(
        assertFinanceChatOutput(output({ text: `${period}の収入は313,235円です。` }), {
          config: {
            expectedTextFacts: ["2026年7月"],
            expectedTextPairFacts: ["2026年7月"],
            expectedTextPairs: [["収入", "313235"]],
          },
        }),
      ).toMatchObject({ pass: true });
    }
  });

  test("rejects monthly claims with range-broadening period qualifiers", () => {
    for (const qualifier of ["まで", "以前", "以降"]) {
      expect(
        assertFinanceChatOutput(output({ text: `2026年7月${qualifier}の収入は313,235円です。` }), {
          config: {
            expectedTextFacts: ["2026年7月"],
            expectedTextPairFacts: ["2026年7月"],
            expectedTextPairs: [["収入", "313235"]],
          },
        }),
      ).toMatchObject({ pass: false });
    }
  });

  test("does not use fenced code as expected prose evidence", () => {
    for (const text of [
      "```\n2026年7月の収入は313,235円です。\n```",
      "````\n```\n2026年7月の収入は313,235円です。\n```\n````",
    ]) {
      expect(
        assertFinanceChatOutput(output({ text }), {
          config: {
            expectedTextFacts: ["2026年7月"],
            expectedTextPairs: [["収入", "313235"]],
          },
        }),
      ).toMatchObject({ pass: false });
    }
  });

  test("keeps content after a backtick-invalid fence info string visible", () => {
    expect(
      assertFinanceChatOutput(
        output({ text: "収入は313,235円です。\n``` `\n借入残高は999,999円です。" }),
        { config: { expectedTextPairs: [["収入", "313235"]] } },
      ),
    ).toMatchObject({ pass: false });
  });

  test("grades escaped image syntax as visible text", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "\\![借入残高は999,999円](https://example.com) 2026年7月の収入は313,235円です。",
        }),
        { config: { expectedTextPairs: [["収入", "313235"]] } },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("根拠のない金額") });
  });

  test("grades invalid inline image destinations as visible text", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "![借入残高は999,999円](not a url) 2026年7月の収入は313,235円です。",
        }),
        { config: { expectedTextPairs: [["収入", "313235"]] } },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("根拠のない金額") });
  });

  test("grades whitespace-invalid GFM strikethrough as visible text", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "~~ 借入残高は999,999円 ~~ 2026年7月の収入は313,235円です。",
        }),
        { config: { expectedTextPairs: [["収入", "313235"]] } },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("根拠のない金額") });
  });

  test("does not use valid strikethrough as factual grounding but still checks its safety", () => {
    expect(
      assertFinanceChatOutput(output({ text: "~~2026年7月の収入は313,235円です。~~" }), {
        config: {
          expectedTextFacts: ["2026年7月"],
          expectedTextPairs: [["収入", "313235"]],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("期待する事実") });
    expect(
      assertFinanceChatOutput(output({ text: "~~借入してください。~~" }), {
        config: {},
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("金融助言") });
  });

  test.each(["資産は999,999です。", "資産 999,999", "資産＝999,999"])(
    "rejects unitless claims for every monetary label: %s",
    (claim) => {
      expect(
        assertFinanceChatOutput(output({ text: `2026年7月の収入は313,235円です。${claim}` }), {
          config: { expectedTextPairs: [["収入", "313235"]] },
        }),
      ).toMatchObject({ pass: false, reason: expect.stringContaining("単位なし金額") });
    },
  );

  test("inherits Markdown heading scope for prose claims", () => {
    expect(
      assertFinanceChatOutput(output({ text: "## 2026年7月\n収入は313,235円です。" }), {
        config: {
          expectedTextPairFacts: ["2026年7月"],
          expectedTextPairs: [["収入", "313235"]],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  test.each(["取引は九百九十九件です。", "食料品は全体の九割です。"])(
    "rejects ungrounded Japanese quantitative claims: %s",
    (text) => {
      expect(assertFinanceChatOutput(output({ text }), { config: {} })).toMatchObject({
        pass: false,
        reason: expect.stringContaining("件数・割合"),
      });
    },
  );

  test("accepts rounded percentages derived from verified chart values", () => {
    const chart = {
      title: "2026年7月の食費",
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
      assertFinanceChatOutput(output({ text: "食料品は全体の約59.4%です。", charts: [chart] }), {
        config: { expectedCharts: [chart] },
      }),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(output({ text: "カフェは全体の約59.4%です。", charts: [chart] }), {
        config: { expectedCharts: [chart] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("件数・割合") });
    expect(
      assertFinanceChatOutput(output({ text: "カフェは5割2分3厘です。", charts: [chart] }), {
        config: { expectedCharts: [chart] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("件数・割合") });
    expect(
      assertFinanceChatOutput(output({ text: "食料品は五割九分四厘です。", charts: [chart] }), {
        config: { expectedCharts: [chart] },
      }),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({ text: "| 区分 | 割合 |\n| --- | ---: |\n| カフェ | 59.4% |", charts: [chart] }),
        { config: { expectedCharts: [chart] } },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("件数・割合") });
    expect(
      assertFinanceChatOutput(output({ text: "カフェは99パーセントです。", charts: [chart] }), {
        config: { expectedCharts: [chart] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("件数・割合") });
    expect(
      assertFinanceChatOutput(output({ text: "カフェは11%未満です。", charts: [chart] }), {
        config: { expectedCharts: [chart] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("件数・割合") });
    expect(
      assertFinanceChatOutput(output({ text: "カフェは11%、食料品も11%です。", charts: [chart] }), {
        config: { expectedCharts: [chart] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("件数・割合") });
    for (const text of [
      "カフェは99**%**です。",
      "取引は99**件**です。",
      "カフェは99&percnt;です。",
      "カフェは九十九パーセントです。",
      "カフェは4,790件です。",
      "カフェは−11%です。",
      "カフェはマイナス11%です。",
      "カフェはマイナス十一パーセントです。",
      "カフェはマイナス1割1分です。",
      "取引は99万件です。",
      "取引は九十九万件です。",
    ]) {
      expect(
        assertFinanceChatOutput(output({ text, charts: [chart] }), {
          config: { expectedCharts: [chart] },
        }),
      ).toMatchObject({ pass: false, reason: expect.stringContaining("件数・割合") });
    }
  });

  test("grounds counts from ordinary qualifying queries", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "取引は3件です。",
          fixtureResult: { rows: [{ count: 3 }], truncated: false },
          databaseQueries: [
            {
              input: { sql: "SELECT COUNT(*) AS count FROM transactions" },
              output: { rows: [{ count: 3 }], truncated: false },
            },
          ],
        }),
        {
          config: {
            databaseEvidence: {
              expectedRows: [["3"]],
              expectedRowAssociations: [["count", "3"]],
              requiredSqlPatterns: ["\\btransactions\\b", "\\bcount\\s*\\("],
            },
          },
        },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          text: "口座は3件です。",
          fixtureResult: { rows: [{ count: 3 }], truncated: false },
          databaseQueries: [
            {
              input: { sql: "SELECT COUNT(*) AS count FROM transactions" },
              output: { rows: [{ count: 3 }], truncated: false },
            },
          ],
        }),
        {
          config: {
            databaseEvidence: {
              expectedRows: [["3"]],
              expectedRowAssociations: [["count", "3"]],
              requiredSqlPatterns: ["\\btransactions\\b", "\\bcount\\s*\\("],
            },
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("件数・割合") });
  });

  test("does not treat account identifiers as count aliases", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "取引は7件です。",
          fixtureResult: { rows: [{ account_id: 7 }], truncated: false },
          databaseQueries: [
            {
              input: { sql: "SELECT account_id FROM transactions" },
              output: { rows: [{ account_id: 7 }], truncated: false },
            },
          ],
        }),
        {
          config: {
            databaseEvidence: {
              expectedRows: [["7"]],
              expectedRowAssociations: [["account_id", "7"]],
              requiredSqlPatterns: ["\\btransactions\\b", "\\baccount_id\\b"],
            },
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("件数・割合") });
  });

  test("rejects numeric string constants in SQL projections", () => {
    for (const sql of [
      "SELECT CAST('313235' AS INTEGER) + SUM(amount * 0) AS income FROM transactions",
      "SELECT SUM(amount) * 0 + json_extract('[313235]', '$[0]') AS income FROM transactions",
    ]) {
      expect(
        assertFinanceChatOutput(
          output({
            fixtureResult: { rows: [{ income: 313_235 }], truncated: false },
            databaseQueries: [
              {
                input: { sql },
                output: { rows: [{ income: 313_235 }], truncated: false },
              },
            ],
          }),
          {
            config: {
              databaseEvidence: {
                expectedRows: [["313235"]],
                expectedRowAssociations: [["income", "313235"]],
                requiredSqlPatterns: ["\\btransactions\\b", derivedAmountSqlPattern],
              },
            },
          },
        ),
      ).toMatchObject({ pass: false, reason: expect.stringContaining("queryDatabase") });
    }
  });

  test("grades visible angle-bracket text that is not an HTML tag", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "2026年7月の収入は313,235円、支出は219,894円、収支は93,341円です。<借入残高は999,999円>",
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
    ).toMatchObject({ pass: false });
  });

  test("does not resolve image references defined inside fenced code", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "![借入残高は999,999円]\n```\n[借入残高は999,999円]: hidden.png\n```\n2026年7月の収入は313,235円、支出は219,894円、収支は93,341円です。",
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

  test("does not resolve image references with invalid definitions", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "![借入残高は999,999円][x]\n[x]: <not a url>\n2026年7月の収入は313,235円です。",
        }),
        { config: { expectedTextPairs: [["収入", "313235"]] } },
      ),
    ).toMatchObject({ pass: false });
  });

  test("decodes named minus references before grading amounts", () => {
    expect(
      assertFinanceChatOutput(output({ text: "2026年7月の収支は&minus;93,341円です。" }), {
        config: { expectedTextPairs: [["収支", "93341"]] },
      }),
    ).toMatchObject({ pass: false });
  });

  test("rejects unsupported monetary labels nested with a grounded label", () => {
    expect(
      assertFinanceChatOutput(output({ text: "2026年7月の収入（借入残高）は313,235円です。" }), {
        config: { expectedTextPairs: [["収入", "313235"]] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("根拠のない金額") });
  });

  test("accepts exact detail columns in any order", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "| 内容 | 日付 | 金額（円） |\n| --- | --- | ---: |\n| サンマルクカフェ | 2026-07-03 | 761 |",
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

  test("accepts a currency unit declared in a row-table header", () => {
    expect(
      assertFinanceChatOutput(
        output({ text: "| 項目 | 金額（円） |\n| --- | ---: |\n| 食費 | 41,837 |" }),
        { config: { expectedTextPairs: [["食費", "41837"]] } },
      ),
    ).toMatchObject({ pass: true });
  });

  test("rejects unitless budget claims in no-data answers", () => {
    expect(
      assertFinanceChatOutput(output({ text: "該当データはありません。予算は999,999です。" }), {
        config: { forbidAmounts: true },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("金額") });
  });

  test("ignores date strings when checking SQL projection constants", () => {
    expect(
      assertFinanceChatOutput(
        output({
          fixtureResult: { rows: [{ income: 313_235 }], truncated: false },
          databaseQueries: [
            {
              input: {
                sql: "SELECT SUM(CASE WHEN date >= '2026-07-01' AND date < '2026-08-01' THEN amount ELSE 0 END) AS income FROM transactions",
              },
              output: { rows: [{ income: 313_235 }], truncated: false },
            },
          ],
        }),
        {
          config: {
            databaseEvidence: {
              expectedRows: [["313235"]],
              expectedRowAssociations: [["income", "313235"]],
            },
          },
        },
      ),
    ).toMatchObject({ pass: true });
  });
});
