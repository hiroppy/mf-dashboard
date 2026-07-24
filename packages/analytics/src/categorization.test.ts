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
    vi.mocked(generateText).mockReset();
  });

  test("LLMが無効の場合はgenerateTextを呼ばずnullを返す", async () => {
    vi.mocked(isLLMEnabled).mockReturnValue(false);

    const result = await generateCategoryDecisionWithLLM({ transaction, candidates });

    expect(result).toBeNull();
    expect(generateText).not.toHaveBeenCalled();
  });

  test("候補カテゴリID一覧から選ばせるpromptでLLM決定を返す", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: {
        largeCategoryId: "13",
        middleCategoryId: "77",
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
