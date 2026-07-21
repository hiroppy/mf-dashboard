import { describe, expect, it } from "vitest";
import assertFinanceChatOutput from "./assertions";

const validOutput = JSON.stringify({
  text: "2026-07の食費です。",
  cards: [
    {
      type: "summary",
      title: "食費",
      metrics: [{ label: "食費", amount: 41_837, amountType: "expense" }],
    },
    {
      type: "categoryBreakdown",
      title: "カテゴリ別支出",
      categories: [{ name: "食費", amount: 41_837, amountType: "expense", percentage: 100 }],
      href: "/demo/cf/2026-07",
    },
  ],
});

describe("assertFinanceChatOutput", () => {
  it("accepts expected facts, cards, and route in the final response", () => {
    expect(
      assertFinanceChatOutput(validOutput, {
        config: {
          expectedFacts: ["食費", 41_837],
          expectedAnyFacts: ["住宅", "食費"],
          expectedMetrics: [{ label: "食費", amount: 41_837, amountType: "expense" }],
          expectedCardTypes: ["summary", "categoryBreakdown"],
          expectedRoute: "/cf/2026-07",
        },
      }),
    ).toMatchObject({ pass: true, score: 1 });
  });

  it("reports missing facts, cards, routes, and forbidden phrases", () => {
    const result = assertFinanceChatOutput(
      JSON.stringify({
        text: "わかりません",
        cards: [
          {
            type: "summary",
            title: "不明",
            metrics: [{ label: "金額", amount: 1, amountType: "balance" }],
            href: "/demo/cf",
          },
        ],
      }),
      {
        config: {
          expectedFacts: [41_837],
          expectedAnyFacts: ["食費", "日用品"],
          expectedMetrics: [{ label: "食費", amount: 41_837, amountType: "expense" }],
          expectedCardTypes: ["insight"],
          expectedRoute: "/bs",
          forbiddenPhrases: ["わかりません"],
        },
      },
    );

    expect(result).toMatchObject({ pass: false, score: 0 });
    expect(result.reason).toContain("期待 facts 不足");
    expect(result.reason).toContain("card 順序不一致");
    expect(result.reason).toContain("期待候補 facts 不足");
    expect(result.reason).toContain("期待 metric 不足");
    expect(result.reason).toContain("期待 route 不足");
    expect(result.reason).toContain("禁止表現");
  });

  it("rejects malformed provider output", () => {
    expect(assertFinanceChatOutput("not-json")).toMatchObject({ pass: false, score: 0 });
    expect(
      assertFinanceChatOutput(
        JSON.stringify({ text: "回答", cards: [{ type: "summary", amount: 1 }] }),
      ),
    ).toMatchObject({ pass: false, score: 0 });
  });

  it("requires the configured card order without extras", () => {
    const result = assertFinanceChatOutput(validOutput, {
      config: { expectedCardTypes: ["categoryBreakdown", "summary"] },
    });

    expect(result).toMatchObject({ pass: false, score: 0 });
    expect(result.reason).toContain("card 順序不一致");
  });

  it("does not accept expected numbers or routes from negated prose", () => {
    const result = assertFinanceChatOutput(
      JSON.stringify({
        text: "実際には313235円も/bsも確認できていません。",
        cards: [
          {
            type: "summary",
            title: "確認結果",
            metrics: [{ label: "確認済み", amount: 1, amountType: "balance" }],
            href: "/demo/cf",
          },
        ],
      }),
      {
        config: {
          expectedFacts: [313_235],
          expectedCardTypes: ["summary"],
          expectedRoute: "/bs",
        },
      },
    );

    expect(result).toMatchObject({ pass: false, score: 0 });
    expect(result.reason).toContain("期待 facts 不足");
    expect(result.reason).toContain("期待 route 不足");
  });

  it("binds expected amounts to their label and amount type", () => {
    const result = assertFinanceChatOutput(
      JSON.stringify({
        text: "月次結果です。",
        cards: [
          {
            type: "summary",
            title: "月次収支",
            metrics: [
              { label: "支出", amount: 313_235, amountType: "expense" },
              { label: "収入", amount: 219_894, amountType: "income" },
              { label: "参考", amount: 93_341, amountType: "balance" },
            ],
            href: "/demo/cf/2026-07",
          },
        ],
      }),
      {
        config: {
          expectedCardTypes: ["summary"],
          expectedMetrics: [
            { label: "収入", amount: 313_235, amountType: "income" },
            { label: "支出", amount: 219_894, amountType: "expense" },
            { label: "収支", amount: 93_341, amountType: "balance" },
          ],
        },
      },
    );

    expect(result).toMatchObject({ pass: false, score: 0 });
    expect(result.reason).toContain("期待 metric 不足");
  });

  it("rejects unsupported financial and period claims in final text", () => {
    const result = assertFinanceChatOutput(
      JSON.stringify({
        text: "2020年は999円の赤字です。",
        cards: [
          {
            type: "summary",
            title: "2026-07の収支",
            metrics: [{ label: "収支", amount: 93_341, amountType: "balance" }],
            href: "/demo/cf/2026-07",
          },
        ],
      }),
      { config: { expectedCardTypes: ["summary"] } },
    );

    expect(result).toMatchObject({ pass: false, score: 0 });
    expect(result.reason).toContain("本文の未根拠金額: 999");
    expect(result.reason).toContain("本文の未根拠期間: 2020");
    expect(result.reason).toContain("黒字／赤字表現");
  });

  it("does not treat a CTA route as a semantic period fact", () => {
    const result = assertFinanceChatOutput(
      JSON.stringify({
        text: "月次結果です。",
        cards: [
          {
            type: "summary",
            title: "月次収支",
            metrics: [{ label: "収支", amount: 93_341, amountType: "balance" }],
            href: "/demo/cf/2026-07",
          },
        ],
      }),
      {
        config: {
          expectedFacts: ["2026-07"],
          expectedCardTypes: ["summary"],
          expectedRoute: "/cf/2026-07",
        },
      },
    );

    expect(result).toMatchObject({ pass: false, score: 0 });
    expect(result.reason).toContain("期待 facts 不足: 2026-07");
    expect(result.reason).not.toContain("期待 route 不足");
  });

  it("binds final-text amounts to financial labels", () => {
    const result = assertFinanceChatOutput(
      JSON.stringify({
        text: "収入は219,894円、支出は313,235円です。",
        cards: [
          {
            type: "summary",
            title: "2026-07の月次収支",
            metrics: [
              { label: "収入", amount: 313_235, amountType: "income" },
              { label: "支出", amount: 219_894, amountType: "expense" },
            ],
            href: "/demo/cf/2026-07",
          },
        ],
      }),
      { config: { expectedCardTypes: ["summary"] } },
    );

    expect(result.reason).toContain("本文の未根拠金額");
  });

  it("accepts correctly labeled amounts and a derived savings rate", () => {
    const result = assertFinanceChatOutput(
      JSON.stringify({
        text: "収入は313,235円、支出は219,894円、貯蓄率は29.8%です。",
        cards: [
          {
            type: "summary",
            title: "2026-07の月次収支",
            metrics: [
              { label: "収入", amount: 313_235, amountType: "income" },
              { label: "支出", amount: 219_894, amountType: "expense" },
              { label: "収支", amount: 93_341, amountType: "balance" },
            ],
            href: "/demo/cf/2026-07",
          },
        ],
      }),
      { config: { expectedCardTypes: ["summary"] } },
    );

    expect(result).toMatchObject({ pass: true, score: 1 });
  });

  it("rejects scaled yen, yearless month, and fabricated link claims", () => {
    const result = assertFinanceChatOutput(
      JSON.stringify({
        text: "8月の支出は￥999万円です。[詳細](https://example.com)",
        cards: [
          {
            type: "summary",
            title: "2026-07の支出",
            metrics: [{ label: "支出", amount: 219_894, amountType: "expense" }],
            href: "/demo/cf/2026-07",
          },
        ],
      }),
      { config: { expectedCardTypes: ["summary"] } },
    );

    expect(result.reason).toContain("9990000");
    expect(result.reason).toContain("未根拠期間: 8");
    expect(result.reason).toContain("未根拠リンク: https://example.com");
  });

  it("rejects unexpected metrics and amount-as-percentage claims", () => {
    const result = assertFinanceChatOutput(
      JSON.stringify({
        text: "貯蓄率は313235%です。",
        cards: [
          {
            type: "summary",
            title: "2026-07の収支",
            metrics: [
              { label: "収入", amount: 313_235, amountType: "income" },
              { label: "貯蓄", amount: 999_999, amountType: "balance" },
            ],
            href: "/demo/cf/2026-07",
          },
        ],
      }),
      {
        config: {
          expectedCardTypes: ["summary"],
          expectedMetrics: [{ label: "収入", amount: 313_235, amountType: "income" }],
        },
      },
    );

    expect(result.reason).toContain("未根拠 metric: 貯蓄");
    expect(result.reason).toContain("本文の未根拠割合: 313235");
  });

  it("validates category percentage and every transaction row", () => {
    const result = assertFinanceChatOutput(
      JSON.stringify({
        text: "2026-07の食費です。",
        cards: [
          {
            type: "summary",
            title: "食費",
            metrics: [{ label: "食費", amount: 41_837, amountType: "expense" }],
          },
          {
            type: "categoryBreakdown",
            title: "カテゴリ別支出",
            categories: [{ name: "食費", amount: 41_837, amountType: "expense", percentage: 100 }],
          },
          {
            type: "transactionList",
            title: "食費明細",
            transactions: [
              {
                id: "fabricated",
                date: "2026-07-10",
                description: "架空店舗",
                category: "食費",
                amount: 41_837,
                amountType: "expense",
              },
            ],
            href: "/demo/cf/2026-07",
          },
        ],
      }),
      {
        config: {
          expectedCardTypes: ["summary", "categoryBreakdown", "transactionList"],
          expectedCategories: [
            {
              label: "食費",
              amount: 41_837,
              amountType: "expense",
              percentage: 19.02598525,
            },
          ],
          expectedTransactions: ["demo_001265|2026-07-10|成城石井|食費|3152|expense"],
          expectedTransactionTotal: 41_837,
        },
      },
    );

    expect(result.reason).toContain("カテゴリ collection が fixture と一致しません");
    expect(result.reason).toContain("取引明細 collection が fixture と一致しません");
  });

  it("validates financial claims and comparisons in card prose", () => {
    const result = assertFinanceChatOutput(
      JSON.stringify({
        text: "結果をカードにまとめました。",
        cards: [
          {
            type: "summary",
            title: "2026-07の収支",
            metrics: [{ label: "支出", amount: 219_894, amountType: "expense" }],
            href: "/demo/cf/2026-07",
          },
          {
            type: "insight",
            title: "支出の変化",
            description: "前月より支出が999万円増えました",
          },
        ],
      }),
      { config: { expectedCardTypes: ["summary", "insight"] } },
    );

    expect(result.reason).toContain("card proseの未根拠金額: 9990000");
    expect(result.reason).toContain("card proseに根拠のない期間比較");
  });

  it("does not let card prose ground its own period", () => {
    const result = assertFinanceChatOutput(
      JSON.stringify({
        text: "結果です。",
        cards: [
          {
            type: "summary",
            title: "2020年の収支",
            metrics: [{ label: "収支", amount: 93_341, amountType: "balance" }],
            href: "/demo/cf/2026-07",
          },
        ],
      }),
      {
        config: {
          expectedCardTypes: ["summary"],
          expectedPeriods: ["2026-07"],
          expectedRoute: "/cf/2026-07",
        },
      },
    );

    expect(result.reason).toContain("card proseの未根拠期間: 2020");
  });

  it("compares transaction rows as an exact multiset", () => {
    const transaction = {
      id: "demo_001265",
      date: "2026-07-10",
      description: "成城石井",
      category: "食費",
      amount: 3_152,
      amountType: "expense",
    };
    const result = assertFinanceChatOutput(
      JSON.stringify({
        text: "明細です。",
        cards: [
          {
            type: "transactionList",
            title: "明細",
            transactions: [transaction, transaction],
            href: "/demo/cf/2026-07",
          },
        ],
      }),
      {
        config: {
          expectedCardTypes: ["transactionList"],
          expectedTransactions: ["demo_001265|2026-07-10|成城石井|食費|3152|expense"],
        },
      },
    );

    expect(result.reason).toContain("取引明細 collection が fixture と一致しません");
  });

  it("rejects unconfigured structured insight amounts", () => {
    const result = assertFinanceChatOutput(
      JSON.stringify({
        text: "見直し候補です。",
        cards: [
          {
            type: "insight",
            title: "支出改善",
            description: "食費を確認しましょう",
            amount: 999_999,
            amountLabel: "見直し候補額",
            amountType: "balance",
            action: { label: "内訳", href: "/demo/cf/2026-07" },
          },
        ],
      }),
      {
        config: {
          expectedCardTypes: ["insight"],
          allowedMetricAmounts: [41_837, 19_475, 11_198],
        },
      },
    );

    expect(result.reason).toContain("未根拠 metric: 見直し候補額");
  });

  it("distinguishes liability claims from total assets", () => {
    const result = assertFinanceChatOutput(
      JSON.stringify({
        text: "負債は5,683,100円です。",
        cards: [
          {
            type: "summary",
            title: "総資産",
            metrics: [{ label: "総資産", amount: 5_683_100, amountType: "balance" }],
            href: "/demo/bs",
          },
        ],
      }),
      { config: { expectedCardTypes: ["summary"] } },
    );

    expect(result.reason).toContain("本文の未根拠金額: 5683100");
  });

  it("accepts comparisons grounded by exact expected chart values", () => {
    const result = assertFinanceChatOutput(
      JSON.stringify({
        text: "前月より10,000円増えました。",
        cards: [
          {
            type: "chart",
            title: "支出推移",
            chartType: "line",
            series: [{ name: "支出", amountType: "expense" }],
            data: [
              { label: "2026-06", values: [209_894] },
              { label: "2026-07", values: [219_894] },
            ],
            href: "/demo/cf/2026-07",
          },
        ],
      }),
      {
        config: {
          expectedCardTypes: ["chart"],
          expectedChartValues: [209_894, 219_894],
        },
      },
    );

    expect(result).toMatchObject({ pass: true, score: 1 });
  });

  it("rejects comparisons backed by unexpected chart values", () => {
    const result = assertFinanceChatOutput(
      JSON.stringify({
        text: "前月より10,000円増えました。",
        cards: [
          {
            type: "chart",
            title: "支出推移",
            chartType: "line",
            series: [{ name: "支出", amountType: "expense" }],
            data: [
              { label: "2026-06", values: [1] },
              { label: "2026-07", values: [10_001] },
            ],
            href: "/demo/cf/2026-07",
          },
        ],
      }),
      {
        config: {
          expectedCardTypes: ["chart"],
          expectedChartValues: [209_894, 219_894],
        },
      },
    );

    expect(result.reason).toContain("chart values が fixture と一致しません");
    expect(result.reason).toContain("根拠のない期間比較");
  });
});
