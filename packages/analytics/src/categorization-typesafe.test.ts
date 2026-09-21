import { describe, expect, test, vi } from "vitest";
import { generateCategoryDecisionWithTypeSafe } from "./categorization-typesafe.js";

const systemOne = vi.fn<(request: unknown) => Promise<unknown>>();

vi.mock("@typesafe-ai/sdk", () => ({
  TypeSafeClient: class {
    systemOne = systemOne;
  },
  choice: (instructions: unknown, criteria: unknown) => ({
    type: "choice",
    instructions,
    criteria,
  }),
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
  {
    largeCategoryId: "10",
    largeCategoryName: "通信費",
    middleCategoryId: "55",
    middleCategoryName: "情報サービス",
    isIncome: false,
  },
  {
    largeCategoryId: "16",
    largeCategoryName: "教養・教育",
    middleCategoryId: "20",
    middleCategoryName: "書籍",
    isIncome: false,
  },
];

const transaction = {
  date: "2026-06-01",
  amount: 1200,
  type: "expense" as const,
  description: "Streaming Service A",
};

describe("generateCategoryDecisionWithTypeSafe", () => {
  test("候補が空の場合はsystemOneを呼ばずnullを返す", async () => {
    const result = await generateCategoryDecisionWithTypeSafe({
      transaction,
      candidates: [],
    });

    expect(systemOne).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  test("候補IDの組をcriteriaのキーにし店名をstateへ渡す", async () => {
    systemOne.mockResolvedValue({
      answers: {
        category: {
          choice: "13:77",
          confidence: 0.62,
          probabilities: { "13:77": 0.62, "11:41": 0.21 },
        },
      },
    });

    await generateCategoryDecisionWithTypeSafe({ transaction, candidates });

    const request = systemOne.mock.calls[0]?.[0] as {
      state: Record<string, unknown>;
      questions: { category: { instructions: string; criteria: Record<string, string> } };
    };
    expect(request.state).toEqual({
      date: "2026-06-01",
      amount: 1200,
      type: "expense",
      description: "Streaming Service A",
    });
    expect(request.questions.category.criteria).toEqual({
      "11:41": "食費 > 食料品",
      "13:77": "趣味・娯楽 > 動画・音楽",
      "10:55": "通信費 > 情報サービス",
      "16:20": "教養・教育 > 書籍",
    });
    expect(request.questions.category.instructions).not.toContain("Streaming Service A");
  });

  test("choiceを候補IDの組へ引き直しreasonを確率上位3件から組み立てる", async () => {
    systemOne.mockResolvedValue({
      answers: {
        category: {
          choice: "13:77",
          confidence: 0.62,
          probabilities: { "13:77": 0.62, "10:55": 0.12, "11:41": 0.21, "16:20": 0.05 },
        },
      },
    });

    const result = await generateCategoryDecisionWithTypeSafe({ transaction, candidates });

    expect(result).toEqual({
      source: "llm",
      largeCategoryId: "13",
      middleCategoryId: "77",
      confidence: 0.62,
      reason: "趣味・娯楽 > 動画・音楽 0.62 / 食費 > 食料品 0.21 / 通信費 > 情報サービス 0.12",
    });
  });

  test("choiceが候補に無い場合はnullを返す", async () => {
    systemOne.mockResolvedValue({
      answers: {
        category: { choice: "99:99", confidence: 0.9, probabilities: { "99:99": 0.9 } },
      },
    });

    const result = await generateCategoryDecisionWithTypeSafe({ transaction, candidates });

    expect(result).toBeNull();
  });

  test("systemOneが投げた例外はそのまま投げる", async () => {
    systemOne.mockRejectedValue(new Error("network error"));

    await expect(generateCategoryDecisionWithTypeSafe({ transaction, candidates })).rejects.toThrow(
      "network error",
    );
  });
});
