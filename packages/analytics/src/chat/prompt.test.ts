import { describe, expect, it } from "vitest";
import { FINANCE_CHAT_MAX_TOOL_STEPS, getFinanceChatSystemPrompt } from "./prompt";

describe("finance chat prompt", () => {
  it("uses the same Asia/Tokyo date at a UTC month boundary", () => {
    const prompt = getFinanceChatSystemPrompt(new Date("2026-07-31T15:30:00.000Z"));

    expect(prompt).toContain("現在日付は2026-08-01（Asia/Tokyo）");
  });

  it("keeps enough steps for data, navigation, and presentation", () => {
    expect(FINANCE_CHAT_MAX_TOOL_STEPS).toBeGreaterThanOrEqual(3);
  });
});
