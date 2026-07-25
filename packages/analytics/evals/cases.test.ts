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
});
