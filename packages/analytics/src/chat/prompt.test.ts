import { describe, expect, test } from "vitest";
import {
  FINANCE_CHAT_MAX_GENERATION_STEPS,
  FINANCE_CHAT_MAX_OUTPUT_TOKENS,
  FINANCE_CHAT_REQUEST_TIMEOUT_MS,
  getFinanceChatSystemPrompt,
} from "./prompt";

describe("finance chat prompt", () => {
  test("production limits remain explicit and shared", () => {
    expect(FINANCE_CHAT_MAX_GENERATION_STEPS).toBe(9);
    expect(FINANCE_CHAT_MAX_OUTPUT_TOKENS).toBe(2_000);
    expect(FINANCE_CHAT_REQUEST_TIMEOUT_MS).toBe(55_000);
  });

  test("formats the evaluation date in Asia/Tokyo", () => {
    const prompt = getFinanceChatSystemPrompt(new Date("2026-07-31T16:00:00.000Z"));

    expect(prompt).toContain("現在日付は2026-08-01（Asia/Tokyo）");
    expect(prompt).toContain("queryDatabase");
    expect(prompt).toContain("presentChart");
    expect(prompt).toContain("getFinanceDashboardRoute");
  });
});
