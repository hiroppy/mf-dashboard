import type { Page } from "playwright";
import { updateTransactionCategory } from "../hooks/helpers.js";
import { warn as defaultWarn } from "../logger.js";
import type { ResolvedCategoryDecision } from "./types.js";

type TransactionCategoryUpdater = typeof updateTransactionCategory;

interface ApplyCategoryDecisionsOptions {
  page: Page;
  csrfToken: string;
  decisions: ResolvedCategoryDecision[];
  updater?: TransactionCategoryUpdater;
  warn?: (...args: unknown[]) => void;
}

export async function applyCategoryDecisions(
  options: ApplyCategoryDecisionsOptions,
): Promise<{ appliedCount: number }> {
  const updater = options.updater ?? updateTransactionCategory;
  const warn = options.warn ?? defaultWarn;
  let appliedCount = 0;

  for (const item of options.decisions) {
    try {
      const result = await updater(options.page, options.csrfToken, item.transaction.mfId, {
        largeCategoryId: item.candidate.largeCategoryId,
        middleCategoryId: item.candidate.middleCategoryId,
        isIncome: item.candidate.isIncome,
        isTarget: !item.transaction.isExcludedFromCalculation,
      });

      if (result.ok) {
        appliedCount++;
      } else {
        warn(`Failed to update transaction category: ${item.transaction.mfId} (${result.status})`);
      }
    } catch (err) {
      warn(`Failed to update transaction category: ${item.transaction.mfId}`, err);
    }
  }

  return { appliedCount };
}
