import type { FinanceChatCard } from "@mf-dashboard/analytics/chat/cards";

export interface FinanceChatEvaluationCase {
  id: string;
  prompt: string;
  requiredTools: readonly string[];
  expectedCardTypes: readonly FinanceChatCard["type"][];
}

export const FINANCE_CHAT_EVALUATION_CASES: readonly FinanceChatEvaluationCase[] = [
  {
    id: "monthly-summary",
    prompt: "今月どう？",
    requiredTools: ["getLatestMonthlySummary"],
    expectedCardTypes: ["summary", "insight"],
  },
  {
    id: "category-expense",
    prompt: "今月の食費は？",
    requiredTools: ["searchTransactions", "getMonthlyCategoryTotals"],
    expectedCardTypes: ["summary", "categoryBreakdown", "transactionList"],
  },
  {
    id: "daily-expense",
    prompt: "今月10日の支出を見たい",
    requiredTools: ["searchTransactions"],
    expectedCardTypes: ["summary", "transactionList", "action"],
  },
  {
    id: "total-assets",
    prompt: "総資産は？",
    requiredTools: ["getLatestTotalAssets"],
    expectedCardTypes: ["summary"],
  },
  {
    id: "spending-review",
    prompt: "削れそうな支出ある？",
    requiredTools: ["getFinancialMetrics"],
    expectedCardTypes: ["insight"],
  },
];
