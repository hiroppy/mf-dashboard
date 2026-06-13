import { findExistingTransactionMfIds } from "@mf-dashboard/db/repository/transactions";
import type { CashFlowItem, CashFlowSummary } from "@mf-dashboard/db/types";
import type { Page } from "playwright";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { getCsrfToken } from "../hooks/helpers.js";
import { scrapeCashFlowMonth } from "../scrapers/cash-flow-history.js";
import { scrapeCategoryCandidates } from "../scrapers/category-candidates.js";
import { applyCategoryDecisions } from "./apply.js";
import { categorizeCashFlowMonth } from "./categorize-cash-flow.js";
import type { NormalizedCategoryDecisionConfig } from "./types.js";

vi.mock("@mf-dashboard/analytics/categorization", () => ({
  generateCategoryDecisionWithLLM: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("@mf-dashboard/db/repository/transactions", () => ({
  findExistingTransactionMfIds: vi.fn<() => Promise<Set<string>>>(),
}));

vi.mock("../hooks/helpers.js", () => ({
  getCsrfToken: vi.fn<() => Promise<string | null>>(),
}));

vi.mock("../scrapers/cash-flow-history.js", () => ({
  scrapeCashFlowMonth: vi.fn<() => Promise<CashFlowSummary>>(),
}));

vi.mock("../scrapers/category-candidates.js", () => ({
  scrapeCategoryCandidates: vi.fn<() => Promise<unknown[]>>(),
}));

vi.mock("./apply.js", () => ({
  applyCategoryDecisions: vi.fn<() => Promise<{ appliedCount: number }>>(),
}));

const config: NormalizedCategoryDecisionConfig = {
  llm: { enabled: false, maxPerRun: 5, minConfidence: 0.65 },
  rules: [{ contains: "Service A", category: "食費", subCategory: "食料品" }],
};

function cashFlow(month: string, items: CashFlowItem[]): CashFlowSummary {
  return {
    month,
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    items,
  };
}

function item(mfId: string, description = "Service A"): CashFlowItem {
  return {
    mfId,
    date: "2026-06-01",
    amount: 1200,
    type: "expense",
    accountName: "Account A",
    description,
    category: "未分類",
    subCategory: null,
    isTransfer: false,
    isExcludedFromCalculation: false,
  };
}

describe("categorizeCashFlowMonth", () => {
  beforeEach(() => {
    vi.mocked(findExistingTransactionMfIds).mockReset();
    vi.mocked(scrapeCashFlowMonth).mockReset();
    vi.mocked(scrapeCategoryCandidates).mockReset();
    vi.mocked(getCsrfToken).mockReset();
    vi.mocked(applyCategoryDecisions).mockReset();

    vi.mocked(scrapeCategoryCandidates).mockResolvedValue([
      {
        largeCategoryId: "11",
        largeCategoryName: "食費",
        middleCategoryId: "41",
        middleCategoryName: "食料品",
        isIncome: false,
      },
    ]);
    vi.mocked(getCsrfToken).mockResolvedValue("csrf");
  });

  test("再スクレイプ後の取引でDB既存mfIdを照合し直す", async () => {
    const db = {} as Parameters<typeof categorizeCashFlowMonth>[0]["db"];
    const initialCashFlow = cashFlow("2026-06", [item("initial-new")]);
    const latestCashFlow = cashFlow("2026-06", [item("latest-existing"), item("latest-new")]);
    vi.mocked(findExistingTransactionMfIds)
      .mockResolvedValueOnce(new Set())
      .mockResolvedValueOnce(new Set(["latest-existing"]));
    vi.mocked(scrapeCashFlowMonth).mockResolvedValue(latestCashFlow);
    vi.mocked(applyCategoryDecisions).mockResolvedValue({ appliedCount: 0 });

    await categorizeCashFlowMonth({
      page: {} as Page,
      db,
      cashFlow: initialCashFlow,
      config,
      usage: { llmCallsUsed: 0 },
    });

    expect(findExistingTransactionMfIds).toHaveBeenNthCalledWith(2, db, [
      "latest-existing",
      "latest-new",
    ]);
    expect(vi.mocked(applyCategoryDecisions).mock.calls[0]?.[0].decisions).toHaveLength(1);
    expect(
      vi.mocked(applyCategoryDecisions).mock.calls[0]?.[0].decisions[0]?.transaction.mfId,
    ).toBe("latest-new");
  });

  test("カテゴリ反映後の再スクレイプ失敗時は元データではなく反映直前の最新データを返す", async () => {
    const initialCashFlow = cashFlow("2026-06", [item("initial-new")]);
    const latestCashFlow = cashFlow("2026-06", [item("latest-new")]);
    vi.mocked(findExistingTransactionMfIds).mockResolvedValue(new Set());
    vi.mocked(scrapeCashFlowMonth)
      .mockResolvedValueOnce(latestCashFlow)
      .mockRejectedValueOnce(new Error("final scrape failed"));
    vi.mocked(applyCategoryDecisions).mockResolvedValue({ appliedCount: 1 });

    const result = await categorizeCashFlowMonth({
      page: {} as Page,
      db: {} as Parameters<typeof categorizeCashFlowMonth>[0]["db"],
      cashFlow: initialCashFlow,
      config,
      usage: { llmCallsUsed: 0 },
    });

    expect(result).toBe(latestCashFlow);
  });
});
