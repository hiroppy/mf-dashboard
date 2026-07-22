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
    expect(result.reason).toContain("不足 summary metrics: 収支=123");
    expect(result.reason).toContain("card types 不一致: expected=insight actual=summary");
    expect(result.reason).toContain("不足 route: /bs");
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
    ).toMatchObject({ pass: false, reason: "不足 summary metrics: 収支=93341" });
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
});
