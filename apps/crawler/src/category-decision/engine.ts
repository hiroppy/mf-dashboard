import type {
  CategoryCandidate,
  CategoryDecision,
  CategoryDecisionUsage,
  LLMCategoryDecision,
  LLMCategoryDecider,
  NormalizedCategoryDecisionConfig,
  ResolvedCategoryDecision,
  TransactionForCategorization,
} from "./types.js";

interface CategoryDecisionEngineOptions {
  config: NormalizedCategoryDecisionConfig;
  candidates: CategoryCandidate[];
  llmDecider?: LLMCategoryDecider;
  warn?: (...args: unknown[]) => void;
  usage?: CategoryDecisionUsage;
}

export function selectTransactionsForCategorization(
  transactions: TransactionForCategorization[],
  existingMfIds: Set<string>,
): TransactionForCategorization[] {
  return transactions.filter((transaction) => {
    return (
      transaction.mfId.length > 0 &&
      !transaction.mfId.startsWith("unknown") &&
      !existingMfIds.has(transaction.mfId) &&
      transaction.category === "未分類" &&
      !transaction.isTransfer &&
      !transaction.isExcludedFromCalculation
    );
  });
}

function candidateTypeMatches(
  candidate: CategoryCandidate,
  transaction: TransactionForCategorization,
): boolean {
  return candidate.isIncome === (transaction.type === "income");
}

function findCandidateByName(
  candidates: CategoryCandidate[],
  transaction: TransactionForCategorization,
  category: string,
  subCategory: string,
): CategoryCandidate | null {
  return (
    candidates.find(
      (candidate) =>
        candidate.largeCategoryName === category &&
        candidate.middleCategoryName === subCategory &&
        candidateTypeMatches(candidate, transaction),
    ) ?? null
  );
}

function findCandidateById(
  candidates: CategoryCandidate[],
  transaction: TransactionForCategorization,
  decision: LLMCategoryDecision,
): CategoryCandidate | null {
  return (
    candidates.find(
      (candidate) =>
        candidate.largeCategoryId === decision.largeCategoryId &&
        candidate.middleCategoryId === decision.middleCategoryId &&
        candidateTypeMatches(candidate, transaction),
    ) ?? null
  );
}

function ruleMatches(
  transaction: TransactionForCategorization,
  rule: NormalizedCategoryDecisionConfig["rules"][number],
): boolean {
  if (!rule.accountName && !rule.descriptionContains) return false;
  if (rule.accountName && transaction.accountName !== rule.accountName) return false;
  if (rule.descriptionContains && !transaction.description.includes(rule.descriptionContains)) {
    return false;
  }
  return true;
}

export class CategoryDecisionEngine {
  readonly #config: NormalizedCategoryDecisionConfig;
  readonly #candidates: CategoryCandidate[];
  readonly #llmDecider: LLMCategoryDecider | undefined;
  readonly #warn: (...args: unknown[]) => void;
  readonly #usage: CategoryDecisionUsage;

  constructor(options: CategoryDecisionEngineOptions) {
    this.#config = options.config;
    this.#candidates = options.candidates;
    this.#llmDecider = options.llmDecider;
    this.#warn = options.warn ?? (() => {});
    this.#usage = options.usage ?? { llmCallsUsed: 0 };
  }

  async decideMany(
    transactions: TransactionForCategorization[],
  ): Promise<ResolvedCategoryDecision[]> {
    const results: ResolvedCategoryDecision[] = [];

    for (const transaction of transactions) {
      const decision = await this.#decide(transaction);
      if (decision) {
        results.push(decision);
      }
    }

    return results;
  }

  async #decide(
    transaction: TransactionForCategorization,
  ): Promise<ResolvedCategoryDecision | null> {
    const ruleDecision = this.#decideByRule(transaction);
    if (ruleDecision) return ruleDecision;

    if (!this.#config.llm.enabled || !this.#llmDecider) return null;
    if (this.#usage.llmCallsUsed >= this.#config.llm.maxPerRun) return null;

    try {
      const llmCandidates = this.#candidates.filter((candidate) =>
        candidateTypeMatches(candidate, transaction),
      );
      if (llmCandidates.length === 0) return null;

      this.#usage.llmCallsUsed += 1;
      const llmDecision = await this.#llmDecider(transaction, llmCandidates);
      if (!llmDecision) return null;

      if (llmDecision.confidence < this.#config.llm.minConfidence) {
        return null;
      }

      return this.#resolveLLMDecision(transaction, llmDecision);
    } catch {
      this.#warn("LLM category decision failed (code: LLM_REQUEST_FAILED).");
      return null;
    }
  }

  #decideByRule(transaction: TransactionForCategorization): ResolvedCategoryDecision | null {
    for (const rule of this.#config.rules) {
      if (!ruleMatches(transaction, rule)) continue;

      const candidate = findCandidateByName(
        this.#candidates,
        transaction,
        rule.category,
        rule.subCategory,
      );

      if (!candidate) {
        this.#warn(
          `Invalid category rule ignored: ${rule.category} > ${rule.subCategory} is not in Money Forward candidates`,
        );
        continue;
      }

      const decision: CategoryDecision = {
        source: "rule",
        category: rule.category,
        subCategory: rule.subCategory,
        confidence: 1,
        reason: `Matched rule: ${[
          rule.accountName ? `accountName=${rule.accountName}` : null,
          rule.descriptionContains ? `descriptionContains=${rule.descriptionContains}` : null,
        ]
          .filter(Boolean)
          .join(" + ")}`,
      };

      return {
        transaction,
        decision,
        candidate,
      };
    }

    return null;
  }

  #resolveLLMDecision(
    transaction: TransactionForCategorization,
    decision: LLMCategoryDecision,
  ): ResolvedCategoryDecision | null {
    const candidate = findCandidateById(this.#candidates, transaction, decision);

    if (!candidate) {
      this.#warn(
        `LLM category decision ignored: ${decision.largeCategoryId} > ${decision.middleCategoryId} is not in Money Forward candidates`,
      );
      return null;
    }

    return {
      transaction,
      decision: {
        source: "llm",
        category: candidate.largeCategoryName,
        subCategory: candidate.middleCategoryName,
        confidence: decision.confidence,
        reason: decision.reason,
      },
      candidate,
    };
  }
}
