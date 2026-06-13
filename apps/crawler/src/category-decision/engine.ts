import type {
  CategoryCandidate,
  CategoryDecision,
  CategoryDecisionUsage,
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

function isValidMfId(mfId: string): boolean {
  return mfId.length > 0 && !mfId.startsWith("unknown");
}

function isUnclassified(category: string | null): boolean {
  return category === "未分類";
}

export function selectTransactionsForCategorization(
  transactions: TransactionForCategorization[],
  existingMfIds: Set<string>,
): TransactionForCategorization[] {
  return transactions.filter((transaction) => {
    return (
      isValidMfId(transaction.mfId) &&
      !existingMfIds.has(transaction.mfId) &&
      isUnclassified(transaction.category) &&
      !transaction.isTransfer &&
      !transaction.isExcludedFromCalculation
    );
  });
}

function getValidContainsNeedles(contains: string | string[]): string[] | null {
  const needles = Array.isArray(contains) ? contains : [contains];
  if (needles.length === 0) return null;
  if (needles.some((needle) => needle.trim().length === 0)) return null;
  return needles;
}

function containsNeedles(text: string, needles: string[]): boolean {
  return needles.every((needle) => text.includes(needle));
}

function candidateTypeMatches(
  candidate: CategoryCandidate,
  transaction: TransactionForCategorization,
): boolean {
  return candidate.isIncome === (transaction.type === "income");
}

function findCandidate(
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

function buildSearchText(transaction: TransactionForCategorization): string {
  return `${transaction.accountName ?? ""} ${transaction.description}`;
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

    this.#usage.llmCallsUsed += 1;

    try {
      const llmCandidates = this.#candidates.filter((candidate) =>
        candidateTypeMatches(candidate, transaction),
      );
      const llmDecision = await this.#llmDecider(transaction, llmCandidates);
      if (!llmDecision) return null;

      if (llmDecision.confidence < this.#config.llm.minConfidence) {
        return null;
      }

      return this.#resolveDecision(transaction, llmDecision);
    } catch (err) {
      this.#warn(`LLM category decision failed for transaction ${transaction.mfId}:`, err);
      return null;
    }
  }

  #decideByRule(transaction: TransactionForCategorization): ResolvedCategoryDecision | null {
    const searchText = buildSearchText(transaction);

    for (const rule of this.#config.rules) {
      const needles = getValidContainsNeedles(rule.contains);
      if (!needles) {
        this.#warn(
          "Invalid category rule ignored: contains must be a non-empty string or non-empty string array",
        );
        continue;
      }

      if (!containsNeedles(searchText, needles)) continue;

      const decision: CategoryDecision = {
        source: "rule",
        category: rule.category,
        subCategory: rule.subCategory,
        confidence: 1,
        reason: `Matched rule: ${needles.join(" + ")}`,
      };

      const resolved = this.#resolveDecision(transaction, decision);
      if (resolved) return resolved;

      this.#warn(
        `Invalid category rule ignored: ${rule.category} > ${rule.subCategory} is not in Money Forward candidates`,
      );
    }

    return null;
  }

  #resolveDecision(
    transaction: TransactionForCategorization,
    decision: CategoryDecision,
  ): ResolvedCategoryDecision | null {
    const candidate = findCandidate(
      this.#candidates,
      transaction,
      decision.category,
      decision.subCategory,
    );

    if (!candidate) {
      if (decision.source === "llm") {
        this.#warn(
          `LLM category decision ignored: ${decision.category} > ${decision.subCategory} is not in Money Forward candidates`,
        );
      }
      return null;
    }

    return { transaction, decision, candidate };
  }
}
