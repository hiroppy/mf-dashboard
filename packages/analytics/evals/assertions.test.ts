import { describe, expect, it } from "vitest";
import assertFinanceResponse from "./assertions";

const output = JSON.stringify({
  text: "2026年7月の収支です。",
  cards: [
    {
      type: "summary",
      title: "月次収支",
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
          expectedFacts: ["2026年7月"],
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

  it("reports every missing expectation", () => {
    const result = assertFinanceResponse(output, {
      config: {
        expectedFacts: ["未記載"],
        expectedMetrics: [{ label: "収支", amount: 123, amountType: "balance" }],
        expectedCardTypes: ["insight"],
        expectedRoute: "/bs",
      },
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toContain("不足 facts: 未記載");
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
        config: { expectedTransactions: [{ date: "2026-07-10", amount: 3435 }] },
      }),
    ).toMatchObject({
      pass: false,
      reason: "transactions 不一致: expected=2026-07-10=3435",
    });
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
});
