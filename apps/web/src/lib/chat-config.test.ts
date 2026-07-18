import { describe, expect, it } from "vitest";
import { DEFAULT_CHAT_SUGGESTED_PROMPTS, parseChatSuggestedPrompts } from "./chat-config";

describe("parseChatSuggestedPrompts", () => {
  it("parses comma-separated prompts and removes empty entries", () => {
    expect(parseChatSuggestedPrompts(" 今月の支出は？, 資産を見せて ,,先月と比較して ")).toEqual([
      "今月の支出は？",
      "資産を見せて",
      "先月と比較して",
    ]);
  });

  it.each([undefined, "", " , , "])("uses defaults when no prompts are configured", (value) => {
    expect(parseChatSuggestedPrompts(value)).toEqual(DEFAULT_CHAT_SUGGESTED_PROMPTS);
  });
});
