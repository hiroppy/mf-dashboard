import type { Page } from "playwright";
import { describe, expect, test, vi } from "vitest";
import { applyCategoryDecisions } from "./apply.js";
import type { ResolvedCategoryDecision } from "./types.js";

type TestUpdater = NonNullable<Parameters<typeof applyCategoryDecisions>[0]["updater"]>;

function decision(mfId: string): ResolvedCategoryDecision {
  return {
    transaction: {
      mfId,
      date: "2026-06-01",
      amount: 1200,
      type: "expense",
      accountName: "カードA",
      description: "Service A",
      category: "未分類",
      subCategory: null,
      isTransfer: false,
      isExcludedFromCalculation: false,
    },
    decision: {
      source: "rule",
      category: "食費",
      subCategory: "食料品",
      confidence: 1,
      reason: "matched",
    },
    candidate: {
      largeCategoryId: "11",
      largeCategoryName: "食費",
      middleCategoryId: "41",
      middleCategoryName: "食料品",
      isIncome: false,
    },
  };
}

describe("applyCategoryDecisions", () => {
  test("/cf/updateにカテゴリIDを渡して成功件数を返す", async () => {
    const updater = vi.fn<TestUpdater>().mockResolvedValue({ ok: true, status: 200 });
    const resolvedDecision = decision("tx-1");

    const result = await applyCategoryDecisions({
      page: {} as Page,
      csrfToken: "csrf",
      decisions: [resolvedDecision],
      updater,
    });

    expect(result.appliedCount).toBe(1);
    expect(result.appliedDecisions).toEqual([resolvedDecision]);
    expect(updater).toHaveBeenCalledWith({} as Page, "csrf", "tx-1", {
      largeCategoryId: "11",
      middleCategoryId: "41",
      isIncome: false,
      isTarget: true,
    });
  });

  test("計算対象外の取引はisTarget=falseで更新する", async () => {
    const updater = vi.fn<TestUpdater>().mockResolvedValue({ ok: true, status: 200 });
    const excludedDecision = decision("tx-excluded");
    excludedDecision.transaction.isExcludedFromCalculation = true;

    await applyCategoryDecisions({
      page: {} as Page,
      csrfToken: "csrf",
      decisions: [excludedDecision],
      updater,
    });

    expect(updater).toHaveBeenCalledWith({} as Page, "csrf", "tx-excluded", {
      largeCategoryId: "11",
      middleCategoryId: "41",
      isIncome: false,
      isTarget: false,
    });
  });

  test("更新失敗時もthrowせずwarnして未反映として扱う", async () => {
    const warn = vi.fn<(...args: unknown[]) => void>();
    const updater = vi
      .fn<TestUpdater>()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockRejectedValueOnce(new Error("network"));

    const result = await applyCategoryDecisions({
      page: {} as Page,
      csrfToken: "csrf",
      decisions: [decision("tx-1"), decision("tx-2")],
      updater,
      warn,
    });

    expect(result.appliedCount).toBe(0);
    expect(result.appliedDecisions).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
