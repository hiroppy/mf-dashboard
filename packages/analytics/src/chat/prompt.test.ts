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
});
