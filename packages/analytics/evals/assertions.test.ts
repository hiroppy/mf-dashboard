import { describe, expect, it } from "vitest";
import assertFinanceChatOutput from "./assertions";

const validOutput = JSON.stringify({
  text: "2026-07の食費です。",
  cards: [
    {
      type: "summary",
      title: "食費",
      metrics: [{ label: "支出", amount: 41_837, amountType: "expense" }],
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
    expect(result.reason).toContain("本文の未根拠数値: 999");
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
});
