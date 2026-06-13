import { generateText } from "ai";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { generateCategoryDecisionWithLLM } from "./categorization.js";
import { isLLMEnabled } from "./config.js";

vi.mock("ai", () => ({
  generateText: vi.fn<() => Promise<unknown>>(),
  Output: {
    object: vi.fn<(value: unknown) => unknown>((value) => value),
  },
}));

vi.mock("./config.js", () => ({
  getModel: vi.fn<() => string>(() => "mock-model"),
  isLLMEnabled: vi.fn<() => boolean>(),
}));

const candidates = [
  {
    largeCategoryName: "食費",
    middleCategoryName: "食料品",
    isIncome: false,
  },
  {
    largeCategoryName: "趣味・娯楽",
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
    vi.mocked(generateText).mockReset();
  });

  test("LLMが無効の場合はgenerateTextを呼ばずnullを返す", async () => {
    vi.mocked(isLLMEnabled).mockReturnValue(false);

    const result = await generateCategoryDecisionWithLLM({ transaction, candidates });

    expect(result).toBeNull();
    expect(generateText).not.toHaveBeenCalled();
  });

  test("候補カテゴリ一覧から選ばせるpromptでLLM決定を返す", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: {
        category: "趣味・娯楽",
        subCategory: "動画・音楽",
        confidence: 0.78,
        reason: "subscription service",
      },
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await generateCategoryDecisionWithLLM({ transaction, candidates });

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generateText).mock.calls[0]?.[0]).toMatchObject({
      model: "mock-model",
    });
    const prompt = vi.mocked(generateText).mock.calls[0]?.[0].prompt;
    expect(prompt).toEqual(expect.stringContaining("食費 > 食料品"));
    expect(prompt).toEqual(expect.stringContaining("趣味・娯楽 > 動画・音楽"));
    expect(result).toEqual({
      source: "llm",
      category: "趣味・娯楽",
      subCategory: "動画・音楽",
      confidence: 0.78,
      reason: "subscription service",
    });
  });
});
