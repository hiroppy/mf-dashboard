import { describe, expect, it } from "vitest";
import { FINANCE_CHAT_MAX_TOOL_STEPS, getFinanceChatSystemPrompt } from "./prompt";

describe("finance chat prompt", () => {
  it("uses the supplied date in JST", () => {
    expect(getFinanceChatSystemPrompt(new Date("2026-07-30T15:00:00.000Z"))).toContain(
      "現在日付は2026-07-31（Asia/Tokyo）",
    );
  });

  it("keeps the production tool limit explicit", () => {
    expect(FINANCE_CHAT_MAX_TOOL_STEPS).toBe(8);
  });

  it("does not request individual transactions for a category-total question", () => {
    const prompt = getFinanceChatSystemPrompt();

    expect(prompt).toContain(
      "カテゴリ合計の質問には、対象月のカテゴリ合計だけを取得し、summary、categoryBreakdownを提示してください。個別取引は取得しないでください。",
    );
  });

  it("adds a transaction list only for an explicit category-detail request", () => {
    expect(getFinanceChatSystemPrompt()).toContain(
      "そのカテゴリの明細、取引、詳細を明示的に求めた場合だけ対象取引を検索し、transactionListを追加してください。",
    );
  });
});
