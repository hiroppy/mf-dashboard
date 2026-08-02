import { findExistingTransactionMfIds } from "@mf-dashboard/db/repository/transactions";
import type { CashFlowItem, CashFlowSummary } from "@mf-dashboard/db/types";
import type { Page } from "playwright";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { getCsrfToken } from "../hooks/helpers.js";
import { warn } from "../logger.js";
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

vi.mock("../logger.js", () => ({
  info: vi.fn<(...args: unknown[]) => void>(),
  warn: vi.fn<(...args: unknown[]) => void>(),
}));

vi.mock("../scrapers/category-candidates.js", () => ({
  scrapeCategoryCandidates: vi.fn<() => Promise<unknown[]>>(),
}));

vi.mock("./apply.js", () => ({
  applyCategoryDecisions: vi.fn<() => Promise<{ appliedCount: number }>>(),
}));

const config: NormalizedCategoryDecisionConfig = {
  llm: { enabled: false, maxPerRun: 5, minConfidence: 0.65 },
  rules: [{ descriptionContains: "Service A", category: "食費", subCategory: "食料品" }],
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
    vi.mocked(scrapeCategoryCandidates).mockReset();
    vi.mocked(getCsrfToken).mockReset();
    vi.mocked(applyCategoryDecisions).mockReset();
    vi.mocked(warn).mockReset();

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

  test("履歴取得済みの取引をそのままカテゴリ判定する", async () => {
    const db = {} as Parameters<typeof categorizeCashFlowMonth>[0]["db"];
    const initialCashFlow = cashFlow("2026-06", [item("existing"), item("new")]);
    vi.mocked(findExistingTransactionMfIds).mockResolvedValue(new Set(["existing"]));
    vi.mocked(applyCategoryDecisions).mockResolvedValue({
      appliedCount: 0,
      appliedDecisions: [],
    });

    await categorizeCashFlowMonth({
      page: {} as Page,
      db,
      cashFlow: initialCashFlow,
      config,
      usage: { llmCallsUsed: 0 },
    });

    expect(findExistingTransactionMfIds).toHaveBeenCalledOnce();
    expect(findExistingTransactionMfIds).toHaveBeenCalledWith(db, ["existing", "new"]);
    expect(vi.mocked(applyCategoryDecisions).mock.calls[0]?.[0].decisions).toHaveLength(1);
    expect(
      vi.mocked(applyCategoryDecisions).mock.calls[0]?.[0].decisions[0]?.transaction.mfId,
    ).toBe("new");
  });

  test("カテゴリ反映後も元の月跨ぎ表示期間と取引集合を保持する", async () => {
    const initialCashFlow = {
      ...cashFlow("2026-08", [item("initial-new")]),
      periodStart: "2026-07-26",
      periodEnd: "2026-08-25",
    };
    vi.mocked(findExistingTransactionMfIds).mockResolvedValue(new Set());
    vi.mocked(applyCategoryDecisions).mockImplementation(async ({ decisions }) => ({
      appliedCount: 1,
      appliedDecisions: decisions,
    }));

    const result = await categorizeCashFlowMonth({
      page: {} as Page,
      db: {} as Parameters<typeof categorizeCashFlowMonth>[0]["db"],
      cashFlow: initialCashFlow,
      config,
      usage: { llmCallsUsed: 0 },
    });

    expect(result).toEqual({
      ...initialCashFlow,
      items: [{ ...initialCashFlow.items[0], category: "食費", subCategory: "食料品" }],
    });
  });

  test("一部だけ反映できた場合は成功したカテゴリだけをローカル適用する", async () => {
    const initialCashFlow = cashFlow("2026-06", [item("applied"), item("not-applied")]);
    vi.mocked(findExistingTransactionMfIds).mockResolvedValue(new Set());
    vi.mocked(applyCategoryDecisions).mockImplementation(async ({ decisions }) => ({
      appliedCount: 1,
      appliedDecisions: decisions.slice(0, 1),
    }));

    const result = await categorizeCashFlowMonth({
      page: {} as Page,
      db: {} as Parameters<typeof categorizeCashFlowMonth>[0]["db"],
      cashFlow: initialCashFlow,
      config,
      usage: { llmCallsUsed: 0 },
    });

    expect(result.items).toEqual([
      {
        ...initialCashFlow.items[0],
        category: "食費",
        subCategory: "食料品",
      },
      initialCashFlow.items[1],
    ]);
  });

  test("カテゴリ反映前の失敗時は履歴取得済みの取引を返す", async () => {
    const initialCashFlow = cashFlow("2026-06", [item("initial-new")]);
    vi.mocked(findExistingTransactionMfIds).mockResolvedValue(new Set());
    vi.mocked(scrapeCategoryCandidates).mockRejectedValue(new Error("candidate scrape failed"));

    const result = await categorizeCashFlowMonth({
      page: {} as Page,
      db: {} as Parameters<typeof categorizeCashFlowMonth>[0]["db"],
      cashFlow: initialCashFlow,
      config,
      usage: { llmCallsUsed: 0 },
    });

    expect(result).toBe(initialCashFlow);
    expect(warn).toHaveBeenCalledWith(
      "Category decision failed for 2026-06; saving scraped cash flow (code: CATEGORY_DECISION_PIPELINE_FAILED).",
    );
    expect(JSON.stringify(vi.mocked(warn).mock.calls)).not.toContain("candidate scrape failed");
  });
});
