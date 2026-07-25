import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cases = readFileSync(new URL("./cases.yaml", import.meta.url), "utf8");

function getCase(description: string): string {
  const match = cases.match(
    new RegExp(`- description: ${description}[\\s\\S]*?(?=\\n- description:|$)`),
  );
  if (!match) throw new Error(`評価ケースがありません: ${description}`);
  return match[0];
}

describe("finance chat evaluation cases", () => {
  it("allows expected amounts in the transaction table case", () => {
    expect(getCase("日付別支出が各明細を同じMarkdown表行に返す")).not.toContain("forbidAmounts");
  });

  it("forbids fabricated amounts only in the no-data case", () => {
    expect(getCase("データのない期間で金額を捏造しない")).toContain("forbidAmounts: true");
  });

  it("requires database provenance for every data-backed answer", () => {
    for (const description of [
      "月次収支が収入・支出・収支の正しい値を返す",
      "食費内訳が正しい合計と構造化chartを返す",
      "日付別支出が各明細を同じMarkdown表行に返す",
      "データのない期間で金額を捏造しない",
    ]) {
      expect(getCase(description)).toContain("databaseQuery:");
    }
    expect(getCase("明示的なページ要求だけがroute tool由来のリンクを返す")).not.toContain(
      "databaseQuery:",
    );
  });

  it("binds the food total to the food label", () => {
    const foodCase = getCase("食費内訳が正しい合計と構造化chartを返す");
    expect(foodCase).toContain("expectedTextPairs:");
    expect(foodCase).toContain('- [食費, "41837"]');
  });

  it("requires group, period, and empty-result provenance for no-data", () => {
    const noDataCase = getCase("データのない期間で金額を捏造しない");
    expect(noDataCase).toContain(":groupId");
    expect(noDataCase).toContain("2027-01");
    expect(noDataCase).toContain("expectEmpty: true");
  });
});
