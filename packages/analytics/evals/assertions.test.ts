import { describe, expect, it } from "vitest";
import assertFinanceChatOutput from "./assertions";

const validOutput = JSON.stringify({
  text: "2026-07の食費です。",
  cards: [
    { type: "summary", amount: 41_837 },
    { type: "categoryBreakdown", href: "/groups/demo/cf/2026-07" },
  ],
});

describe("assertFinanceChatOutput", () => {
  it("accepts expected facts, cards, and route in the final response", () => {
    expect(
      assertFinanceChatOutput(validOutput, {
        config: {
          expectedFacts: ["食費", 41_837],
          expectedAnyFacts: ["住宅", "食費"],
          expectedCardTypes: ["summary", "categoryBreakdown"],
          expectedRoute: "/cf/2026-07",
        },
      }),
    ).toMatchObject({ pass: true, score: 1 });
  });

  it("reports missing facts, cards, routes, and forbidden phrases", () => {
    const result = assertFinanceChatOutput(JSON.stringify({ text: "わかりません", cards: [] }), {
      config: {
        expectedFacts: [41_837],
        expectedAnyFacts: ["食費", "日用品"],
        expectedCardTypes: ["summary"],
        expectedRoute: "/cf",
        forbiddenPhrases: ["わかりません"],
      },
    });

    expect(result).toMatchObject({ pass: false, score: 0 });
    expect(result.reason).toContain("期待 facts 不足");
    expect(result.reason).toContain("期待 card 不足");
    expect(result.reason).toContain("期待候補 facts 不足");
    expect(result.reason).toContain("期待 route 不足");
    expect(result.reason).toContain("禁止表現");
  });

  it("rejects malformed provider output", () => {
    expect(assertFinanceChatOutput("not-json")).toMatchObject({ pass: false, score: 0 });
  });
});
