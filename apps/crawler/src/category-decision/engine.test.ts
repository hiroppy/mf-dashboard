import { describe, expect, test, vi } from "vitest";
import { CategoryDecisionEngine, selectTransactionsForCategorization } from "./engine.js";
import type {
  CategoryCandidate,
  LLMCategoryDecider,
  NormalizedCategoryDecisionConfig,
  TransactionForCategorization,
} from "./types.js";

const candidates: CategoryCandidate[] = [
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
    largeCategoryId: "1",
    largeCategoryName: "収入",
    middleCategoryId: "101",
    middleCategoryName: "給与",
    isIncome: true,
  },
];

function tx(overrides: Partial<TransactionForCategorization> = {}): TransactionForCategorization {
  return {
    mfId: "tx-1",
    date: "2026-06-01",
    amount: 1200,
    type: "expense",
    accountName: "カードA",
    description: "Service A 利用料",
    category: "未分類",
    subCategory: null,
    isTransfer: false,
    isExcludedFromCalculation: false,
    ...overrides,
  };
}

describe("selectTransactionsForCategorization", () => {
  test("新規 + 未分類 + 非振替 + 計算対象の取引だけを抽出する", () => {
    const result = selectTransactionsForCategorization(
      [
        tx({ mfId: "new-unclassified" }),
        tx({ mfId: "existing" }),
        tx({ mfId: "categorized", category: "食費" }),
        tx({ mfId: "transfer", category: null, isTransfer: true }),
        tx({ mfId: "excluded", isExcludedFromCalculation: true }),
        tx({ mfId: "unknown-1" }),
      ],
      new Set(["existing"]),
    );

    expect(result.map((item) => item.mfId)).toEqual(["new-unclassified"]);
  });
});

describe("CategoryDecisionEngine", () => {
  test("固定ルールがmatchした場合はrule決定を返しLLMを呼ばない", async () => {
    const llmDecider = vi.fn<LLMCategoryDecider>();
    const config: NormalizedCategoryDecisionConfig = {
      llm: { enabled: true, maxPerRun: 5, minConfidence: 0.65 },
      rules: [
        {
          contains: ["カードA", "Service A"],
          category: "食費",
          subCategory: "食料品",
        },
      ],
    };
    const engine = new CategoryDecisionEngine({ config, candidates, llmDecider });

    const [result] = await engine.decideMany([tx()]);

    expect(result).toMatchObject({
      transaction: { mfId: "tx-1" },
      decision: {
        source: "rule",
        category: "食費",
        subCategory: "食料品",
        confidence: 1,
      },
      candidate: {
        largeCategoryId: "11",
        middleCategoryId: "41",
      },
    });
    expect(llmDecider).not.toHaveBeenCalled();
  });

  test("存在しないカテゴリを指す固定ルールは無効化してwarnする", async () => {
    const warn = vi.fn<(...args: unknown[]) => void>();
    const config: NormalizedCategoryDecisionConfig = {
      llm: { enabled: false, maxPerRun: 5, minConfidence: 0.65 },
      rules: [
        {
          contains: "Service A",
          category: "存在しない大項目",
          subCategory: "存在しない中項目",
        },
      ],
    };
    const engine = new CategoryDecisionEngine({ config, candidates, warn });

    const result = await engine.decideMany([tx()]);

    expect(result).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Invalid category rule"));
  });

  test("空のcontainsを持つ固定ルールは全取引にmatchしない", async () => {
    const warn = vi.fn<(...args: unknown[]) => void>();
    const config: NormalizedCategoryDecisionConfig = {
      llm: { enabled: false, maxPerRun: 5, minConfidence: 0.65 },
      rules: [
        { contains: "", category: "食費", subCategory: "食料品" },
        { contains: [], category: "食費", subCategory: "食料品" },
      ],
    };
    const engine = new CategoryDecisionEngine({ config, candidates, warn });

    const result = await engine.decideMany([tx({ description: "unrelated merchant" })]);

    expect(result).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[0]).toEqual(
      expect.stringContaining("Invalid category rule ignored"),
    );
  });

  test("固定ルールにmatchしない場合だけLLMへfallbackし、候補カテゴリの決定を採用する", async () => {
    const llmDecider = vi.fn<LLMCategoryDecider>().mockResolvedValue({
      source: "llm",
      largeCategoryId: "13",
      middleCategoryId: "77",
      confidence: 0.8,
      reason: "subscription",
    });
    const config: NormalizedCategoryDecisionConfig = {
      llm: { enabled: true, maxPerRun: 5, minConfidence: 0.65 },
      rules: [],
    };
    const engine = new CategoryDecisionEngine({ config, candidates, llmDecider });

    const [result] = await engine.decideMany([tx({ description: "Streaming Service A" })]);

    expect(llmDecider).toHaveBeenCalledTimes(1);
    expect(llmDecider.mock.calls[0]?.[1].map((candidate) => candidate.largeCategoryName)).toEqual([
      "食費",
      "趣味・娯楽",
    ]);
    expect(result).toMatchObject({
      decision: {
        source: "llm",
        category: "趣味・娯楽",
        subCategory: "動画・音楽",
        confidence: 0.8,
      },
      candidate: {
        largeCategoryId: "13",
        middleCategoryId: "77",
      },
    });
  });

  test("LLMが候補にないカテゴリIDを返した場合は採用しない", async () => {
    const warn = vi.fn<(...args: unknown[]) => void>();
    const llmDecider = vi.fn<LLMCategoryDecider>().mockResolvedValue({
      source: "llm",
      largeCategoryId: "999",
      middleCategoryId: "888",
      confidence: 0.8,
      reason: "unknown category",
    });
    const config: NormalizedCategoryDecisionConfig = {
      llm: { enabled: true, maxPerRun: 5, minConfidence: 0.65 },
      rules: [],
    };
    const engine = new CategoryDecisionEngine({ config, candidates, llmDecider, warn });

    const result = await engine.decideMany([tx({ description: "Unknown Service A" })]);

    expect(result).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("LLM category decision ignored"));
  });

  test("LLMが無効の場合は未match取引を推論しない", async () => {
    const llmDecider = vi.fn<LLMCategoryDecider>();
    const config: NormalizedCategoryDecisionConfig = {
      llm: { enabled: false, maxPerRun: 5, minConfidence: 0.65 },
      rules: [],
    };
    const engine = new CategoryDecisionEngine({ config, candidates, llmDecider });

    const result = await engine.decideMany([tx()]);

    expect(result).toEqual([]);
    expect(llmDecider).not.toHaveBeenCalled();
  });

  test("LLMのconfidenceが閾値未満の場合は採用しない", async () => {
    const llmDecider = vi.fn<LLMCategoryDecider>().mockResolvedValue({
      source: "llm",
      largeCategoryId: "13",
      middleCategoryId: "77",
      confidence: 0.64,
      reason: "low confidence",
    });
    const config: NormalizedCategoryDecisionConfig = {
      llm: { enabled: true, maxPerRun: 5, minConfidence: 0.65 },
      rules: [],
    };
    const engine = new CategoryDecisionEngine({ config, candidates, llmDecider });

    const result = await engine.decideMany([tx()]);

    expect(result).toEqual([]);
  });

  test("LLM推論件数はmaxPerRunで制限する", async () => {
    const llmDecider = vi.fn<LLMCategoryDecider>().mockResolvedValue({
      source: "llm",
      largeCategoryId: "13",
      middleCategoryId: "77",
      confidence: 0.8,
      reason: "subscription",
    });
    const config: NormalizedCategoryDecisionConfig = {
      llm: { enabled: true, maxPerRun: 1, minConfidence: 0.65 },
      rules: [],
    };
    const usage = { llmCallsUsed: 0 };
    const engine = new CategoryDecisionEngine({ config, candidates, llmDecider, usage });

    const result = await engine.decideMany([tx({ mfId: "tx-1" }), tx({ mfId: "tx-2" })]);

    expect(result.map((item) => item.transaction.mfId)).toEqual(["tx-1"]);
    expect(llmDecider).toHaveBeenCalledTimes(1);
    expect(usage.llmCallsUsed).toBe(1);
  });
});
