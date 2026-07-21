import { getJstDateParts, getJstYearMonthKey } from "@mf-dashboard/date-utils";
import type { FinanceChatCard } from "../chat/cards";

export interface FinanceChatEvaluationCase {
  id: string;
  prompt: string;
  toolStrategies: readonly (readonly FinanceChatToolExpectation[])[];
  allowedDataTools: readonly string[];
  navigationInput: Readonly<Record<string, unknown>>;
  expectedCardTypes: readonly FinanceChatCard["type"][];
  requireActionableInsight?: boolean;
  requireParallelDataTools?: boolean;
  requiredCategory?: string;
  summaryAmountSource?: "requestedCategory" | "transactionTotal";
}

export interface FinanceChatToolExpectation {
  name: string;
  input?: Readonly<Record<string, unknown>>;
}

export function getFinanceChatEvaluationDate(date: Date = new Date()): Date {
  const { year, month } = getJstDateParts(date);
  // Noon avoids crossing the JST date boundary when represented as a UTC instant.
  return new Date(Date.UTC(year, month, 0, 3));
}

export function createFinanceChatEvaluationCases(
  date: Date = new Date(),
): readonly FinanceChatEvaluationCase[] {
  const month = getJstYearMonthKey(date);
  const day = `${month}-10`;

  return [
    {
      id: "monthly-summary",
      prompt: "今月どう？",
      toolStrategies: [[{ name: "getLatestMonthlySummary" }]],
      allowedDataTools: ["getLatestMonthlySummary"],
      navigationInput: { page: "cashFlow", month },
      expectedCardTypes: ["summary", "insight"],
    },
    {
      id: "category-expense",
      prompt: "今月の食費は？",
      toolStrategies: [
        [
          { name: "searchTransactions", input: { month, category: "食費", type: "expense" } },
          { name: "getMonthlyCategoryTotals", input: { month } },
        ],
      ],
      allowedDataTools: ["searchTransactions", "getMonthlyCategoryTotals"],
      navigationInput: { page: "cashFlow", month },
      expectedCardTypes: ["summary", "categoryBreakdown", "transactionList"],
      requireParallelDataTools: true,
      requiredCategory: "食費",
      summaryAmountSource: "requestedCategory",
    },
    {
      id: "daily-expense",
      prompt: "今月10日の支出を見たい",
      toolStrategies: [[{ name: "searchTransactions", input: { date: day, type: "expense" } }]],
      allowedDataTools: ["searchTransactions"],
      navigationInput: { page: "cashFlow", month },
      expectedCardTypes: ["summary", "transactionList", "action"],
      summaryAmountSource: "transactionTotal",
    },
    {
      id: "total-assets",
      prompt: "総資産は？",
      toolStrategies: [[{ name: "getLatestTotalAssets" }]],
      allowedDataTools: ["getLatestTotalAssets"],
      navigationInput: { page: "balanceSheet" },
      expectedCardTypes: ["summary"],
    },
    {
      id: "spending-review",
      prompt: "削れそうな支出ある？",
      toolStrategies: [[{ name: "getFinancialMetrics" }]],
      allowedDataTools: ["getFinancialMetrics"],
      navigationInput: { page: "cashFlow", month },
      expectedCardTypes: ["insight"],
      requireActionableInsight: true,
    },
  ];
}

export const FINANCE_CHAT_EVALUATION_CASES = createFinanceChatEvaluationCases();
