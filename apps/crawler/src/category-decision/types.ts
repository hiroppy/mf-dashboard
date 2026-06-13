export interface CategoryRuleConfig {
  contains: string | string[];
  category: string;
  subCategory: string;
}

export interface CategoryDecisionConfig {
  llm?: {
    enabled?: boolean;
    maxPerRun?: number;
    minConfidence?: number;
  };
  rules?: CategoryRuleConfig[];
}

export interface NormalizedCategoryDecisionConfig {
  llm: {
    enabled: boolean;
    maxPerRun: number;
    minConfidence: number;
  };
  rules: CategoryRuleConfig[];
}

export interface CategoryDecision {
  source: "rule" | "llm";
  category: string;
  subCategory: string;
  confidence: number;
  reason: string;
}

export interface CategoryCandidate {
  largeCategoryId: string;
  largeCategoryName: string;
  middleCategoryId: string;
  middleCategoryName: string;
  isIncome: boolean;
}

export interface TransactionForCategorization {
  mfId: string;
  date: string;
  amount: number;
  type: "income" | "expense";
  accountName?: string;
  description: string;
  category: string | null;
  subCategory: string | null;
  isTransfer: boolean;
  isExcludedFromCalculation: boolean;
}

export interface ResolvedCategoryDecision {
  transaction: TransactionForCategorization;
  decision: CategoryDecision;
  candidate: CategoryCandidate;
}

export type LLMCategoryDecider = (
  transaction: TransactionForCategorization,
  candidates: CategoryCandidate[],
) => Promise<CategoryDecision | null>;

export interface CategoryDecisionUsage {
  llmCallsUsed: number;
}
