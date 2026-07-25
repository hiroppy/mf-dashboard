import { describe, expect, it } from "vitest";
import {
  FINANCE_CHAT_MAX_GENERATION_STEPS,
  FINANCE_CHAT_MAX_OUTPUT_TOKENS,
  getFinanceChatSystemPrompt,
} from "./prompt";

describe("getFinanceChatSystemPrompt", () => {
  it("uses the supplied date in Asia/Tokyo", () => {
    expect(getFinanceChatSystemPrompt(new Date("2026-07-31T16:00:00.000Z"))).toContain(
      "現在日付は2026-08-01（Asia/Tokyo）",
    );
  });

  it("shares the production generation step limit", () => {
    expect(FINANCE_CHAT_MAX_GENERATION_STEPS).toBe(9);
    expect(FINANCE_CHAT_MAX_OUTPUT_TOKENS).toBe(2_000);
  });
});
