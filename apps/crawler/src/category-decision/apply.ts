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

export interface ApplyCategoryDecisionsResult {
  appliedCount: number;
  appliedDecisions: ResolvedCategoryDecision[];
}

export async function applyCategoryDecisions(
  options: ApplyCategoryDecisionsOptions,
): Promise<ApplyCategoryDecisionsResult> {
  const updater = options.updater ?? updateTransactionCategory;
  const warn = options.warn ?? defaultWarn;
  const appliedDecisions: ResolvedCategoryDecision[] = [];

  for (const item of options.decisions) {
    try {
      const result = await updater(options.page, options.csrfToken, item.transaction.mfId, {
        largeCategoryId: item.candidate.largeCategoryId,
        middleCategoryId: item.candidate.middleCategoryId,
        isIncome: item.candidate.isIncome,
        isTarget: !item.transaction.isExcludedFromCalculation,
      });

      if (result.ok) {
        appliedDecisions.push(item);
      } else {
        warn(`Failed to update transaction category (status: ${result.status}).`);
      }
    } catch {
      warn("Failed to update transaction category (code: CATEGORY_UPDATE_REQUEST_FAILED).");
    }
  }

  return { appliedCount: appliedDecisions.length, appliedDecisions };
}
