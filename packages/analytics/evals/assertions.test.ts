import { describe, expect, it } from "vitest";
import assertFinanceResponse from "./assertions";

const output = JSON.stringify({
  allowedHrefs: ["/0/cf/2026-07"],
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

  it("rejects an allowlisted amount with an unknown label", () => {
    const unknownLabelOutput = JSON.stringify({
      text: "生活費は313,235円です。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収入", amount: 313235, amountType: "income" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(unknownLabelOutput, {
        config: {
          allowedVisibleAmounts: [313235],
          visibleAmountClaims: [{ label: "収入", amount: 313235 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: "誤ラベルの可視金額: 不明=313235" });
  });

  it("rejects a bare unsupported number in a monetary context", () => {
    const bareAmountOutput = JSON.stringify({
      text: "収支は999999です。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    const result = assertFinanceResponse(bareAmountOutput, {
      config: {
        allowedVisibleAmounts: [93341],
        visibleAmountClaims: [{ label: "収支", amount: 93341 }],
      },
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("未許可の可視金額: 999999");
  });

  it.each([0, 99])("rejects a short bare unsupported monetary claim: %s", (amount) => {
    const bareAmountOutput = JSON.stringify({
      text: `収支は${amount}です。`,
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
      assertFinanceResponse(bareAmountOutput, {
        config: {
          allowedVisibleAmounts: [93341],
          visibleAmountClaims: [{ label: "収支", amount: 93341 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("preserves the sign of visible monetary claims", () => {
    const signedAmountOutput = JSON.stringify({
      text: "収支は−93,341円です。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    const result = assertFinanceResponse(signedAmountOutput, {
      config: {
        allowedVisibleAmounts: [93341],
        visibleAmountClaims: [{ label: "収支", amount: 93341 }],
      },
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("未許可の可視金額: -93341");
  });

  it.each(["▲", "△", "▼", "▽"])(
    "treats a triangle-prefixed monetary claim as negative: %s",
    (marker) => {
      const triangleAmountOutput = JSON.stringify({
        text: `収支は${marker}93,341円です。`,
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
        assertFinanceResponse(triangleAmountOutput, {
          config: { allowedVisibleAmounts: [93341] },
        }),
      ).toMatchObject({ pass: false, reason: "未許可の可視金額: -93341" });
    },
  );

  it("treats an accounting-parenthesized amount as negative", () => {
    const parenthesizedAmountOutput = JSON.stringify({
      text: "収支は(93,341円)です。",
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
      assertFinanceResponse(parenthesizedAmountOutput, {
        config: { allowedVisibleAmounts: [93341] },
      }),
    ).toMatchObject({ pass: false, reason: "未許可の可視金額: -93341" });
  });

  it("distinguishes current totals from comparison deltas", () => {
    const wrongRoleOutput = JSON.stringify({
      text: "2026-07の食費は8,085円です。",
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
      assertFinanceResponse(wrongRoleOutput, {
        config: {
          allowedVisibleAmounts: [41837, 49922, 8085],
          visibleAmountClaims: [
            { label: "食費", amount: 41837 },
            { label: "食費", amount: 49922, rolePattern: "(前月|先月|比較)" },
            { label: "食費", amount: 8085, rolePattern: "(差額|差|減少)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: "誤ラベルの可視金額: 食費=8085" });
  });

  it("applies role validation to monetary claims without a unit", () => {
    const wrongRoleOutput = JSON.stringify({
      text: "2026-07の食費は8,085です。",
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
      assertFinanceResponse(wrongRoleOutput, {
        config: {
          allowedVisibleAmounts: [41837, 49922, 8085],
          visibleAmountClaims: [
            { label: "食費", amount: 41837 },
            { label: "食費", amount: 49922, rolePattern: "(前月|先月|比較)" },
            { label: "食費", amount: 8085, rolePattern: "(差額|差|減少)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: "誤ラベルの可視金額: 食費=8085" });
  });

  it("rejects swapped current and comparison-period amounts", () => {
    const swappedPeriodOutput = JSON.stringify({
      text: "前月の食費は41,837円、今月の食費は49,922円です。",
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
      assertFinanceResponse(swappedPeriodOutput, {
        config: {
          allowedVisibleAmounts: [41837, 49922],
          visibleAmountClaims: [
            { label: "食費", amount: 41837 },
            { label: "食費", amount: 49922, rolePattern: "(前月|先月|比較)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("accepts nearby current, comparison, and delta claims in separate clauses", () => {
    const compactComparisonOutput = JSON.stringify({
      text: "食費は41,837円、前月の食費は49,922円、食費の差額は8,085円減少です。",
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
      assertFinanceResponse(compactComparisonOutput, {
        config: {
          allowedVisibleAmounts: [41837, 49922, 8085],
          visibleAmountClaims: [
            { label: "食費", amount: 41837 },
            { label: "食費", amount: 49922, rolePattern: "(前月|先月|比較)" },
            { label: "食費", amount: 8085, rolePattern: "(差額|差|減少)" },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("scopes a period marker to its adjacent amount in one clause", () => {
    const comparisonOutput = JSON.stringify({
      text: "衣服・美容は前月12,111円から19,475円に増加しました。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(comparisonOutput, {
        config: {
          allowedVisibleAmounts: [12111, 19475, 7364],
          visibleAmountClaims: [
            { label: "衣服・美容", amount: 19475 },
            { label: "衣服・美容", amount: 12111, rolePattern: "(前月|先月|比較)" },
            { label: "衣服・美容", amount: 7364, rolePattern: "(差額|差|増加)" },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("does not apply a later role marker to a current amount", () => {
    const comparisonOutput = JSON.stringify({
      text: "衣服・美容は19,475円で前月比7,364円増加しました。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(comparisonOutput, {
        config: {
          allowedVisibleAmounts: [19475, 7364],
          visibleAmountClaims: [
            { label: "衣服・美容", amount: 19475 },
            { label: "衣服・美容", amount: 7364, rolePattern: "(差額|差|前月比|増加)" },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("normalizes full-width digits in visible monetary claims", () => {
    const fullWidthAmountOutput = JSON.stringify({
      text: "支出は９９９，９９９円です。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "支出", amount: 219894, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(fullWidthAmountOutput, {
        config: {
          allowedVisibleAmounts: [219894],
          visibleAmountClaims: [{ label: "支出", amount: 219894 }],
        },
      }),
    ).toMatchObject({ pass: false });
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

  it("rejects a visible transaction count that contradicts the rows", () => {
    const transactionOutput = JSON.stringify({
      text: "3件の支出です。",
      cards: [
        {
          type: "transactionList",
          title: "支出明細 3件",
          href: "/0/cf/2026-07",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
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
    ).toMatchObject({ pass: false, reason: "明細件数 不一致: expected=1 actual=3" });
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

  it("rejects a truncated transaction group", () => {
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
            expectedCount: 2,
            allowedTransactions: [
              {
                ids: ["tx-a"],
                date: "2026-07-10",
                description: "店舗 A",
                category: "食費",
                amount: 3435,
                amountType: "expense",
              },
              {
                ids: ["tx-b"],
                date: "2026-07-11",
                description: "店舗 B",
                category: "食費",
                amount: 2000,
                amountType: "expense",
              },
            ],
          },
        },
      }),
    ).toMatchObject({ pass: false });
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
            expectedCount: 1,
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

  it("requires the expected route on a structured card", () => {
    const fallbackRouteOutput = JSON.stringify({
      text: "詳細は /0/cf/2026-07 で確認できます。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
        },
      ],
    });

    expect(
      assertFinanceResponse(fallbackRouteOutput, {
        config: { expectedRoute: "/0/cf/2026-07" },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a card route that was not returned by the route tool", () => {
    const fabricatedRouteOutput = JSON.stringify({
      allowedHrefs: [],
      text: "回答",
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
      assertFinanceResponse(fabricatedRouteOutput, {
        config: { expectedRoute: "/0/cf/2026-07" },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects an unexpected route rendered in card text", () => {
    const cardTextRouteOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          description: "詳細は /0/bs です。",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(cardTextRouteOutput, {
        config: { expectedRoute: "/0/cf/2026-07" },
      }),
    ).toMatchObject({ pass: false });
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

  it("accepts a Japanese month format for an expected insight month", () => {
    const localizedMonthOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "2026年7月の衣服・美容は前月より増加しました。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(localizedMonthOutput, {
        config: { expectedInsightFacts: ["2026-07"] },
      }),
    ).toMatchObject({ pass: true });
  });

  it("binds visible months to current and comparison roles", () => {
    const reversedMonthsOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "2026年6月の衣服・美容は前月（2026年7月）より増加しました。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(reversedMonthsOutput, {
        config: {
          allowedVisibleMonths: ["2026-06", "2026-07"],
          visibleMonthClaims: [
            { month: "2026-07" },
            { month: "2026-06", rolePattern: "(前月|先月|比較)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("accepts visible months in their expected comparison roles", () => {
    const comparisonOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "2026年7月の衣服・美容は前月（2026年6月）より増加しました。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(comparisonOutput, {
        config: {
          allowedVisibleMonths: ["2026-06", "2026-07"],
          visibleMonthClaims: [
            { month: "2026-07" },
            { month: "2026-06", rolePattern: "(前月|先月|比較)" },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("honors a preceding role marker for a standalone month", () => {
    const splitMonthOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "前月2026年6月との比較",
          description: "2026年7月の衣服・美容は前月より増加しました。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(splitMonthOutput, {
        config: {
          allowedVisibleMonths: ["2026-06", "2026-07"],
          visibleMonthClaims: [
            { month: "2026-07" },
            { month: "2026-06", rolePattern: "(前月|先月|比較)" },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
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

  it("binds a spending comparison direction to its category", () => {
    const reversedDirectionOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "2026-07の食費は前月より高いため見直します。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(reversedDirectionOutput, {
        config: {
          requiredInsightPatterns: ["(衣服・美容.{0,40}(前月|先月).{0,20}(高い|増加|上回))"],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("does not satisfy a heading fact with a metric label", () => {
    const misleadingHeadingOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "総負債",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(misleadingHeadingOutput, {
        config: {
          expectedCardHeadingFacts: [{ cardType: "summary", pattern: "総資産" }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a displayed month that contradicts the monthly fixture", () => {
    const wrongMonthOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "2026-06月次収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    const result = assertFinanceResponse(wrongMonthOutput, {
      config: {
        allowedVisibleMonths: ["2026-07"],
        expectedCardTextFacts: [{ cardType: "summary", pattern: "(2026[-/]07|2026年7月|7月)" }],
      },
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("未許可の可視月: 2026-06");
  });

  it("recognizes a conflicting yearless visible month", () => {
    const wrongMonthOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "6月の月次収支（7月データ）",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(wrongMonthOutput, {
        config: { allowedVisibleMonths: ["2026-07"] },
      }),
    ).toMatchObject({ pass: false, reason: "未許可の可視月: *-06" });
  });

  it("rejects a contradictory visible deficit claim", () => {
    const deficitOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "2026年7月の収支",
          description: "今月は赤字です。",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(deficitOutput, {
        config: { forbiddenVisiblePatterns: ["(赤字|収支.{0,10}マイナス)"] },
      }),
    ).toMatchObject({ pass: false });
  });

  it.each([
    "今月は黒字ではありませんが、貯蓄を見直します。",
    "衣服・美容は前月より増加していないため、見直し対象外です。",
  ])("rejects a negated qualitative claim: %s", (description) => {
    const negatedOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "分析",
          description,
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(negatedOutput, {
        config: {
          forbiddenVisiblePatterns: [
            "(黒字|プラス).{0,8}(ではない|ありません|ない)",
            "(増加|上回).{0,8}(していない|ありません|ない|対象外)",
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects conflicting visible dates outside transaction rows", () => {
    const conflictingDateOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "2026-07-11の支出",
          metrics: [{ label: "支出", amount: 3435, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
        {
          type: "transactionList",
          title: "2026-07-10の明細",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              amount: 3435,
              amountType: "expense",
            },
          ],
        },
      ],
    });

    const result = assertFinanceResponse(conflictingDateOutput, {
      config: {
        allowedVisibleDates: ["2026-07-10"],
        expectedCardTextFacts: [
          { cardType: "summary", pattern: "(2026-07-10|7月10日)" },
          { cardType: "transactionList", pattern: "(2026-07-10|7月10日)" },
        ],
      },
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("未許可の可視日付: 2026-07-11");
    expect(result.reason).toContain("不足 card text facts");
  });

  it("recognizes conflicting slash-form visible dates", () => {
    const slashDateOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "7/11集計（対象7月10日）",
          metrics: [{ label: "支出", amount: 3435, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(slashDateOutput, {
        config: {
          allowedVisibleDates: ["2026-07-10"],
          expectedCardTextFacts: [
            { cardType: "summary", pattern: "(2026[-/]07[-/]10|7月10日|7/10)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: "未許可の可視日付: *-07-11" });
  });

  it("rejects an unsupported visible percentage claim", () => {
    const percentageOutput = JSON.stringify({
      text: "貯蓄率は99%です。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    const result = assertFinanceResponse(percentageOutput, {
      config: {
        allowedVisiblePercentages: [29.8],
        visiblePercentageClaims: [{ label: "貯蓄率", amount: 29.8 }],
      },
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("未許可の可視割合: 99");
  });

  it("recognizes full-width percentage signs", () => {
    const percentageOutput = JSON.stringify({
      text: "貯蓄率は99％です。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(percentageOutput, {
        config: {
          allowedVisiblePercentages: [29.8],
          visiblePercentageClaims: [{ label: "貯蓄率", amount: 29.8 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("treats a triangle-prefixed percentage as negative", () => {
    const percentageOutput = JSON.stringify({
      text: "現在の貯蓄率は▲29.8%です。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(percentageOutput, {
        config: {
          allowedVisiblePercentages: [29.8],
          visiblePercentageClaims: [{ label: "貯蓄率", amount: 29.8 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects swapped current and comparison-period percentages", () => {
    const swappedPercentageOutput = JSON.stringify({
      text: "前月の貯蓄率は29.8%、今月の貯蓄率は64%です。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(swappedPercentageOutput, {
        config: {
          allowedVisiblePercentages: [29.8, 64],
          visiblePercentageClaims: [
            { label: "貯蓄率", amount: 29.8 },
            { label: "貯蓄率", amount: 64, rolePattern: "(前月|先月|比較)" },
          ],
        },
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

  it("requires a grounded insight metric when configured", () => {
    const qualitativeInsightOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "2026-07は衣服・美容が前月より高いため見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(qualitativeInsightOutput, {
        config: {
          allowedInsightMetrics: [
            { amount: 19475, amountType: "balance", labelPattern: "衣服・美容" },
          ],
          requireInsightMetric: true,
        },
      }),
    ).toMatchObject({ pass: false, reason: "insight metrics 不一致" });
  });

  it("rejects an insight metric with a disallowed semantic amount type", () => {
    const insightOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "食費を見直せそうです。",
          amount: 41837,
          amountLabel: "見直し候補額",
          amountType: "expense",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(insightOutput, {
        config: {
          allowedInsightMetrics: [
            { amount: 41837, amountType: "balance", labelPattern: "(見直し|候補)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: "insight metrics 不一致" });
  });

  it("binds the insight amount to the recommended category", () => {
    const inconsistentInsightOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容が前月より増加したため見直せそうです。",
          amount: 41837,
          amountLabel: "食費の見直し候補",
          amountType: "balance",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(inconsistentInsightOutput, {
        config: {
          allowedInsightMetrics: [
            { amount: 19475, amountType: "balance", labelPattern: "(衣服|見直し|候補)" },
            { amount: 7364, amountType: "balance", labelPattern: "(衣服|差額|増加)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: "insight metrics 不一致" });
  });

  it("parses compound Japanese monetary units", () => {
    const compoundAmountOutput = JSON.stringify({
      text: "総資産は1億2,000万円です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 120000000, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(compoundAmountOutput, {
        config: { allowedVisibleAmounts: [120000000] },
      }),
    ).toMatchObject({ pass: true });
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
