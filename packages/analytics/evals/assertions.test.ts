import { describe, expect, it } from "vitest";
import assertFinanceChatOutput from "./assertions";

const output = JSON.stringify({
  text: "7月は黒字です。",
  cards: [
    {
      type: "summary",
      title: "7月の収支",
      metrics: [
        { label: "収入", amount: 300_000, amountType: "income" },
        { label: "収支", amount: 100_000, amountType: "balance" },
      ],
      href: "/0/cf/2026-07",
    },
    {
      type: "insight",
      title: "次の一歩",
      description: "黒字分を貯蓄へ回せます。",
      action: { label: "内訳を見る", href: "/0/cf/2026-07" },
    },
  ],
  routes: ["/0/cf/2026-07"],
});

describe("assertFinanceChatOutput", () => {
  it("accepts expected cards, metrics, and routes", () => {
    expect(
      assertFinanceChatOutput(output, {
        config: {
          expectedCardTypes: ["summary", "insight"],
          expectedMetrics: [{ label: "収支", amount: 100_000, amountType: "balance" }],
          expectedRoutes: ["/0/cf/2026-07"],
        },
      }),
    ).toMatchObject({ pass: true, score: 1 });
  });

  it.each([
    ["card", { expectedCardTypes: ["transactionList"] }, "期待するカード"],
    [
      "metric",
      { expectedMetrics: [{ label: "支出", amount: 200_000, amountType: "expense" }] },
      "期待する数値カード",
    ],
    ["route", { expectedRoutes: ["/0/bs"] }, "期待する導線"],
  ])("rejects a missing %s", (_, config, reason) => {
    expect(assertFinanceChatOutput(output, { config })).toMatchObject({
      pass: false,
      score: 0,
      reason: expect.stringContaining(reason),
    });
  });

  it("rejects malformed output", () => {
    expect(assertFinanceChatOutput('{"text":"回答"}', {})).toMatchObject({
      pass: false,
      reason: expect.stringContaining("評価JSON形式"),
    });
  });
});
