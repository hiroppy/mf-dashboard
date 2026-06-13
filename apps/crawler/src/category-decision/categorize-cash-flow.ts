import { generateCategoryDecisionWithLLM } from "@mf-dashboard/analytics/categorization";
import type { Db } from "@mf-dashboard/db";
import { findExistingTransactionMfIds } from "@mf-dashboard/db/repository/transactions";
import type { CashFlowItem, CashFlowSummary } from "@mf-dashboard/db/types";
import type { Page } from "playwright";
import { getCsrfToken } from "../hooks/helpers.js";
import { info, warn } from "../logger.js";
import { scrapeCashFlowMonth } from "../scrapers/cash-flow-history.js";
import { scrapeCategoryCandidates } from "../scrapers/category-candidates.js";
import { applyCategoryDecisions } from "./apply.js";
import { CategoryDecisionEngine, selectTransactionsForCategorization } from "./engine.js";
import type {
  CategoryDecisionUsage,
  NormalizedCategoryDecisionConfig,
  TransactionForCategorization,
} from "./types.js";

function toTransactionForCategorization(item: CashFlowItem): TransactionForCategorization | null {
  if (item.type === "transfer") return null;

  return {
    mfId: item.mfId,
    date: item.date,
    amount: item.amount,
    type: item.type,
    accountName: item.accountName,
    description: item.description,
    category: item.category,
    subCategory: item.subCategory,
    isTransfer: item.isTransfer,
    isExcludedFromCalculation: item.isExcludedFromCalculation,
  };
}

function toCategorizationTargets(
  items: CashFlowItem[],
  existingMfIds: Set<string>,
): TransactionForCategorization[] {
  return selectTransactionsForCategorization(
    items
      .map(toTransactionForCategorization)
      .filter((item): item is TransactionForCategorization => item !== null),
    existingMfIds,
  );
}

export async function categorizeCashFlowMonth(options: {
  page: Page;
  db: Db;
  cashFlow: CashFlowSummary;
  config: NormalizedCategoryDecisionConfig;
  usage: CategoryDecisionUsage;
}): Promise<CashFlowSummary> {
  const { page, db, cashFlow, config, usage } = options;

  try {
    const mfIds = cashFlow.items.map((item) => item.mfId);
    const existingMfIds = await findExistingTransactionMfIds(db, mfIds);
    const initialTargets = toCategorizationTargets(cashFlow.items, existingMfIds);

    if (initialTargets.length === 0) {
      return cashFlow;
    }

    const latestCashFlow = await scrapeCashFlowMonth(page, cashFlow.month);
    const latestTargets = toCategorizationTargets(latestCashFlow.items, existingMfIds);
    if (latestTargets.length === 0) {
      return latestCashFlow;
    }

    const candidates = await scrapeCategoryCandidates(page);
    if (candidates.length === 0) {
      warn("Skipped category decision because no Money Forward category candidates were found.");
      return latestCashFlow;
    }

    const engine = new CategoryDecisionEngine({
      config,
      candidates,
      usage,
      warn,
      llmDecider: async (transaction, candidateList) =>
        generateCategoryDecisionWithLLM({
          transaction,
          candidates: candidateList,
        }),
    });
    const decisions = await engine.decideMany(latestTargets);

    if (decisions.length === 0) {
      return latestCashFlow;
    }

    const csrfToken = await getCsrfToken(page);
    if (!csrfToken) {
      warn("Skipped category update because CSRF token was not found.");
      return latestCashFlow;
    }

    const { appliedCount } = await applyCategoryDecisions({
      page,
      csrfToken,
      decisions,
    });

    if (appliedCount === 0) {
      return latestCashFlow;
    }

    info(`Applied category decisions: ${appliedCount}/${decisions.length} for ${cashFlow.month}`);
    return scrapeCashFlowMonth(page, cashFlow.month);
  } catch (err) {
    warn(`Category decision failed for ${cashFlow.month}; saving original categories.`, err);
    return cashFlow;
  }
}
