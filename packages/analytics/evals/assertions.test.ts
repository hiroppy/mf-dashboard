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
          expectedFacts: ["2026年7月", 93341],
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
        expectedFacts: [123],
        expectedCardTypes: ["insight"],
        expectedRoute: "/bs",
      },
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toContain("不足 facts: 123");
    expect(result.reason).toContain("不足 card types: insight");
    expect(result.reason).toContain("不足 route: /bs");
  });
});
