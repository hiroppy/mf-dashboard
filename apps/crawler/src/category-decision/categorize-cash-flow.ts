import { generateCategoryDecisionWithLLM } from "@mf-dashboard/analytics/categorization";
import type { Db } from "@mf-dashboard/db";
import { findExistingTransactionMfIds } from "@mf-dashboard/db/repository/transactions";
import type { CashFlowItem, CashFlowSummary } from "@mf-dashboard/db/types";
import type { Page } from "playwright";
import { getCsrfToken } from "../hooks/helpers.js";
import { info, warn } from "../logger.js";
import { scrapeCategoryCandidates } from "../scrapers/category-candidates.js";
import { applyCategoryDecisions } from "./apply.js";
import { CategoryDecisionEngine, selectTransactionsForCategorization } from "./engine.js";
import type {
  CategoryDecisionUsage,
  NormalizedCategoryDecisionConfig,
  ResolvedCategoryDecision,
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

async function findCategorizationTargets(
  db: Db,
  cashFlow: CashFlowSummary,
): Promise<TransactionForCategorization[]> {
  const mfIds = cashFlow.items.map((item) => item.mfId);
  const existingMfIds = await findExistingTransactionMfIds(db, mfIds);
  return toCategorizationTargets(cashFlow.items, existingMfIds);
}

function applyDecisionsToCashFlow(
  cashFlow: CashFlowSummary,
  decisions: ResolvedCategoryDecision[],
): CashFlowSummary {
  if (decisions.length === 0) return cashFlow;

  const decisionsByMfId = new Map(
    decisions.map((item) => [
      item.transaction.mfId,
      {
        category: item.candidate.largeCategoryName,
        subCategory: item.candidate.middleCategoryName,
      },
    ]),
  );

  return {
    ...cashFlow,
    items: cashFlow.items.map((item) => {
      const decision = decisionsByMfId.get(item.mfId);
      if (!decision) return item;

      return {
        ...item,
        category: decision.category,
        subCategory: decision.subCategory,
      };
    }),
  };
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
    const targets = await findCategorizationTargets(db, cashFlow);
    if (targets.length === 0) return cashFlow;

    const candidates = await scrapeCategoryCandidates(page);
    if (candidates.length === 0) {
      warn("Skipped category decision because no Money Forward category candidates were found.");
      return cashFlow;
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
    const decisions = await engine.decideMany(targets);

    if (decisions.length === 0) {
      return cashFlow;
    }

    const csrfToken = await getCsrfToken(page);
    if (!csrfToken) {
      warn("Skipped category update because CSRF token was not found.");
      return cashFlow;
    }

    const { appliedCount, appliedDecisions } = await applyCategoryDecisions({
      page,
      csrfToken,
      decisions,
    });
    if (appliedCount === 0) {
      return cashFlow;
    }

    info(`Applied category decisions: ${appliedCount}/${decisions.length} for ${cashFlow.month}`);
    return applyDecisionsToCashFlow(cashFlow, appliedDecisions);
  } catch {
    warn(
      `Category decision failed for ${cashFlow.month}; saving scraped cash flow (code: CATEGORY_DECISION_PIPELINE_FAILED).`,
    );
    return cashFlow;
  }
}
