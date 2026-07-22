import { describe, expect, it } from "vitest";
import assertFinanceResponse from "./assertions";

const output = JSON.stringify({
  text: "2026年7月の収支です。",
  cards: [
    {
      type: "summary",
      title: "月次収支",
      description: "2026年7月",
      metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
      href: "/0/cf/2026-07",
    },
  ],
});

describe("assertFinanceResponse", () => {
  it("accepts expected facts, card types, and routes", () => {
    expect(
      assertFinanceResponse(output, {
        config: {
          expectedCardFacts: ["2026年7月"],
          expectedMetrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          expectedCardTypes: ["summary"],
          expectedRoute: "/0/cf/2026-07",
        },
      }),
    ).toMatchObject({ pass: true, score: 1 });
  });

  it("rejects malformed evaluation output", () => {
    expect(assertFinanceResponse("not-json")).toMatchObject({
      pass: false,
      reason: "text/cards の評価 JSON が不正です。",
    });
  });

  it("rejects an undeclared monetary claim in visible text", () => {
    const fabricatedAmountOutput = JSON.stringify({
      text: "支出は999,999円です。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          description: "支出は¥999999です。",
          metrics: [{ label: "支出", amount: 219894, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(fabricatedAmountOutput, {
        config: {
          allowedVisibleAmounts: [219894],
          expectedMetrics: [{ label: "支出", amount: 219894, amountType: "expense" }],
        },
      }),
    ).toMatchObject({ pass: false, reason: "未許可の可視金額: 999999" });
  });

  it("rejects an allowlisted amount assigned to the wrong metric label", () => {
    const mislabeledAmountOutput = JSON.stringify({
      text: "支出は313,235円です。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [
            { label: "収入", amount: 313235, amountType: "income" },
            { label: "支出", amount: 219894, amountType: "expense" },
          ],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(mislabeledAmountOutput, {
        config: {
          allowedVisibleAmounts: [313235, 219894],
          visibleAmountClaims: [
            { label: "収入", amount: 313235 },
            { label: "支出", amount: 219894 },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: "誤ラベルの可視金額: 支出=313235" });
  });

  it("reports every missing expectation", () => {
    const result = assertFinanceResponse(output, {
      config: {
        expectedCardFacts: ["未記載"],
        expectedMetrics: [{ label: "収支", amount: 123, amountType: "balance" }],
        expectedCardTypes: ["insight"],
        expectedRoute: "/bs",
      },
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toContain("不足 card facts: 未記載");
    expect(result.reason).toContain("summary metrics 不一致: expected=収支=123");
    expect(result.reason).toContain("card types 不一致: expected=insight actual=summary");
    expect(result.reason).toContain("route 不一致: expected=/bs actual=/0/cf/2026-07");
  });

  it("does not satisfy a summary metric with an unrelated card amount", () => {
    const misplacedAmountOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収支", amount: 0, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
        {
          type: "insight",
          title: "参考情報",
          description: "別の指標です。",
          amount: 93341,
          amountLabel: "参考額",
          amountType: "balance",
        },
      ],
    });

    expect(
      assertFinanceResponse(misplacedAmountOutput, {
        config: {
          expectedMetrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
        },
      }),
    ).toMatchObject({ pass: false, reason: "summary metrics 不一致: expected=収支=93341" });
  });

  it("rejects unexpected summary metrics", () => {
    const extraMetricOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          href: "/0/cf/2026-07",
          metrics: [
            { label: "収支", amount: 93341, amountType: "balance" },
            { label: "未確認額", amount: 999999, amountType: "balance" },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(extraMetricOutput, {
        config: {
          expectedMetrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
        },
      }),
    ).toMatchObject({ pass: false, reason: "summary metrics 不一致: expected=収支=93341" });
  });

  it("rejects unexpected category rows", () => {
    const extraCategoryOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "categoryBreakdown",
          title: "支出内訳",
          href: "/0/cf/2026-07",
          categories: [
            { name: "食費", amount: 41837, amountType: "expense", percentage: 80 },
            { name: "未確認", amount: 9999, amountType: "expense", percentage: 20 },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(extraCategoryOutput, {
        config: {
          expectedCategories: [
            { label: "食費", amount: 41837, amountType: "expense", percentage: 80 },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: "categories 不一致: expected=食費=41837/80%" });
  });

  it("rejects an incorrect category percentage", () => {
    const categoryOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "categoryBreakdown",
          title: "支出内訳",
          href: "/0/cf/2026-07",
          categories: [{ name: "食費", amount: 41837, amountType: "expense", percentage: 100 }],
        },
      ],
    });

    expect(
      assertFinanceResponse(categoryOutput, {
        config: {
          expectedCategories: [
            { label: "食費", amount: 41837, amountType: "expense", percentage: 19.03 },
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects extra transaction rows outside the expected date", () => {
    const transactionOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "transactionList",
          title: "明細",
          href: "/0/cf/2026-07",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              amount: 3435,
              amountType: "expense",
            },
            {
              id: "tx-b",
              date: "2026-07-11",
              description: "店舗 B",
              amount: 100,
              amountType: "expense",
            },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: {
          expectedTransactions: [
            {
              ids: ["tx-a"],
              date: "2026-07-10",
              description: "店舗 A",
              amount: 3435,
              amountType: "expense",
            },
          ],
        },
      }),
    ).toMatchObject({
      pass: false,
      reason: "transactions 不一致",
    });
  });

  it("rejects a transaction with the wrong amount type", () => {
    const transactionOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "transactionList",
          title: "明細",
          href: "/0/cf/2026-07",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              amount: 3435,
              amountType: "income",
            },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: {
          expectedTransactions: [
            {
              ids: ["tx-a"],
              date: "2026-07-10",
              description: "店舗 A",
              amount: 3435,
              amountType: "expense",
            },
          ],
        },
      }),
    ).toMatchObject({
      pass: false,
      reason: "transactions 不一致",
    });
  });

  it("consumes exact transaction matches as a multiset", () => {
    const transactionOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "transactionList",
          title: "明細",
          href: "/0/cf/2026-07",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              amount: 3435,
              amountType: "expense",
            },
            {
              id: "tx-b",
              date: "2026-07-11",
              description: "店舗 B",
              amount: 9999,
              amountType: "expense",
            },
          ],
        },
      ],
    });
    const expectedTransaction = {
      ids: ["tx-a"],
      date: "2026-07-10",
      description: "店舗 A",
      amount: 3435,
      amountType: "expense",
    };

    expect(
      assertFinanceResponse(transactionOutput, {
        config: { expectedTransactions: [expectedTransaction, expectedTransaction] },
      }),
    ).toMatchObject({ pass: false, reason: "transactions 不一致" });
  });

  it("accepts a truncated transaction group when every visible row matches", () => {
    const transactionOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "transactionList",
          title: "食費明細",
          href: "/0/cf/2026-07",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              category: "食費",
              amount: 3435,
              amountType: "expense",
            },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: {
          expectedTransactionGroup: {
            month: "2026-07",
            category: "食費",
            amountType: "expense",
            allowedTransactions: [
              {
                ids: ["tx-a"],
                date: "2026-07-10",
                description: "店舗 A",
                category: "食費",
                amount: 3435,
                amountType: "expense",
              },
            ],
          },
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("rejects a fabricated row in a transaction group", () => {
    const transactionOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "transactionList",
          title: "食費明細",
          href: "/0/cf/2026-07",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              category: "食費",
              amount: 1,
              amountType: "expense",
            },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: {
          expectedTransactionGroup: {
            month: "2026-07",
            category: "食費",
            amountType: "expense",
            allowedTransactions: [
              {
                ids: ["tx-a"],
                date: "2026-07-10",
                description: "店舗 A",
                category: "食費",
                amount: 3435,
                amountType: "expense",
              },
            ],
          },
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects cards in the wrong presentation order", () => {
    const reversedOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "action",
          title: "次の操作",
          description: "内訳を確認できます。",
          action: { label: "見る", href: "/0/cf/2026-07" },
        },
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
        },
      ],
    });

    expect(
      assertFinanceResponse(reversedOutput, {
        config: { expectedCardTypes: ["summary", "action"] },
      }),
    ).toMatchObject({
      pass: false,
      reason: "card types 不一致: expected=summary,action actual=action,summary",
    });
  });

  it("rejects an unexpected route on any card", () => {
    const mixedRouteOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
        {
          type: "insight",
          title: "補足",
          description: "補足情報です。",
          action: { label: "資産を見る", href: "/0/bs" },
        },
      ],
    });

    expect(
      assertFinanceResponse(mixedRouteOutput, {
        config: { expectedRoute: "/0/cf/2026-07" },
      }),
    ).toMatchObject({
      pass: false,
      reason: "route 不一致: expected=/0/cf/2026-07 actual=/0/cf/2026-07,/0/bs",
    });
  });

  it("rejects an unexpected route in a visible Markdown link", () => {
    const textRouteOutput = JSON.stringify({
      text: "[資産を見る](/0/bs)",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(textRouteOutput, {
        config: { expectedRoute: "/0/cf/2026-07" },
      }),
    ).toMatchObject({
      pass: false,
      reason: "route 不一致: expected=/0/cf/2026-07 actual=/0/cf/2026-07,/0/bs",
    });
  });

  it("rejects an unexpected bare route in visible text", () => {
    const textRouteOutput = JSON.stringify({
      text: "資産は /0/bs で確認できます。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(textRouteOutput, {
        config: { expectedRoute: "/0/cf/2026-07" },
      }),
    ).toMatchObject({
      pass: false,
      reason: "route 不一致: expected=/0/cf/2026-07 actual=/0/cf/2026-07,/0/bs",
    });
  });

  it.each(["/0/cf/2026-07?wrong=1", "/0/cf/2026-07/extra", "/0"])(
    "rejects the complete unexpected visible route: %s",
    (visibleRoute) => {
      const textRouteOutput = JSON.stringify({
        text: `詳細は ${visibleRoute} です。`,
        cards: [
          {
            type: "summary",
            title: "月次収支",
            metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
            href: "/0/cf/2026-07",
          },
        ],
      });

      expect(
        assertFinanceResponse(textRouteOutput, {
          config: { expectedRoute: "/0/cf/2026-07" },
        }),
      ).toMatchObject({ pass: false });
    },
  );

  it("requires insight facts to appear in the insight card", () => {
    const fallbackOnlyOutput = JSON.stringify({
      text: "2026-07の支出改善です。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "食費を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(fallbackOnlyOutput, {
        config: { expectedInsightFacts: ["2026-07"] },
      }),
    ).toMatchObject({
      pass: false,
      reason: "不足 insight facts: 2026-07",
    });
  });

  it("requires insight patterns to appear in the description", () => {
    const fallbackOnlyOutput = JSON.stringify({
      text: "食費は前月より高いため見直せそうです。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "支出を見直しましょう。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(fallbackOnlyOutput, {
        config: { requiredInsightPatterns: ["食費", "前月", "ため"] },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects undeclared insight amounts and generic actions", () => {
    const insightOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "2026-07は食費が前月より高いため見直せそうです。",
          amount: 999999999,
          amountLabel: "削減候補",
          amountType: "balance",
          action: { label: "詳細を確認", href: "/0/cf/2026-07" },
        },
      ],
    });

    const result = assertFinanceResponse(insightOutput, {
      config: {
        allowedInsightMetrics: [],
        expectedInsightActionPattern: "(内訳|支出|食費)",
      },
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("insight metrics 不一致");
    expect(result.reason).toContain("insight action 不一致");
  });

  it("allows an insight metric when exact validation is not configured", () => {
    const insightOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容を見直せそうです。",
          amount: 19475,
          amountLabel: "見直し候補額",
          amountType: "expense",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(assertFinanceResponse(insightOutput)).toMatchObject({ pass: true });
  });

  it.each([
    ["見直し候補は999万円です。", 9_990_000],
    ["見直し候補は2億円です。", 200_000_000],
    ["見直し候補は50千円です。", 50_000],
  ])("normalizes unsupported Japanese monetary units: %s", (text, normalizedAmount) => {
    const unitOutput = JSON.stringify({
      text,
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "支出を見直しましょう。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(unitOutput, { config: { allowedVisibleAmounts: [93341] } }),
    ).toMatchObject({ pass: false, reason: `未許可の可視金額: ${normalizedAmount}` });
  });

  it("validates monetary claims in action labels", () => {
    const actionAmountOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "支出を見直しましょう。",
          action: { label: "999,999円節約の内訳を確認", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(actionAmountOutput, {
        config: { allowedVisibleAmounts: [93341] },
      }),
    ).toMatchObject({ pass: false, reason: "未許可の可視金額: 999999" });
  });

  it("does not use hidden Markdown reference definitions as card facts", () => {
    const hiddenFactOutput = JSON.stringify({
      text: "回答本文です。\n[ref]: https://example.com/食費",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "支出を見直しましょう。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(hiddenFactOutput, {
        config: { expectedCardFacts: ["食費"] },
      }),
    ).toMatchObject({ pass: false, reason: "不足 card facts: 食費" });
  });
});
