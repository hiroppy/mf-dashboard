import { beforeEach, describe, expect, test, vi } from "vitest";
import { generateCategoryDecisionWithLLM } from "./categorization.js";
import { isLLMEnabled } from "./config.js";
import { generate } from "./generation.js";

vi.mock("./generation.js", () => ({
  generate: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("./config.js", () => ({
  isLLMEnabled: vi.fn<() => boolean>(),
}));

const candidates = [
  {
    largeCategoryId: "11",
    largeCategoryName: "食費",
    middleCategoryId: "41",
    middleCategoryName: "食料品",
    isIncome: false,
  },
  {
    largeCategoryId: "13",
    largeCategoryName: "趣味・娯楽",
    middleCategoryId: "77",
    middleCategoryName: "動画・音楽",
    isIncome: false,
  },
];

const transaction = {
  date: "2026-06-01",
  amount: 1200,
  type: "expense" as const,
  accountName: "カードA",
  description: "Streaming Service A",
};

describe("generateCategoryDecisionWithLLM", () => {
  beforeEach(() => {
    vi.mocked(isLLMEnabled).mockReturnValue(true);
    vi.mocked(generate).mockReset();
  });

  test("LLMが無効の場合はgenerateTextを呼ばずnullを返す", async () => {
    vi.mocked(isLLMEnabled).mockReturnValue(false);

    const result = await generateCategoryDecisionWithLLM({ transaction, candidates });

    expect(result).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  test("候補カテゴリID一覧から選ばせるpromptでLLM決定を返す", async () => {
    vi.mocked(generate).mockResolvedValue({
      output: {
        largeCategoryId: "13",
        middleCategoryId: "77",
        confidence: 0.78,
        reason: "subscription service",
      },
    } as Awaited<ReturnType<typeof generate>>);

    const result = await generateCategoryDecisionWithLLM({ transaction, candidates });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generate).mock.calls[0]?.[0]).toHaveProperty("schema");
    const prompt = vi.mocked(generate).mock.calls[0]?.[0].prompt;
    expect(prompt).toEqual(expect.stringContaining("11: 食費 > 41: 食料品"));
    expect(prompt).toEqual(expect.stringContaining("13: 趣味・娯楽 > 77: 動画・音楽"));
    expect(prompt).not.toEqual(expect.stringContaining("金融機関"));
    expect(result).toEqual({
      source: "llm",
      largeCategoryId: "13",
      middleCategoryId: "77",
      confidence: 0.78,
      reason: "subscription service",
    });
  });
});
