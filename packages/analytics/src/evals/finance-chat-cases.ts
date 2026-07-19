import { getJstYearMonthKey } from "@mf-dashboard/date-utils";
import type { FinanceChatCard } from "../chat/cards";

export interface FinanceChatEvaluationCase {
  id: string;
  prompt: string;
  toolStrategies: readonly (readonly FinanceChatToolExpectation[])[];
  allowedDataTools: readonly string[];
  navigationInput: Readonly<Record<string, unknown>>;
  expectedCardTypes: readonly FinanceChatCard["type"][];
}

export interface FinanceChatToolExpectation {
  name: string;
  input?: Readonly<Record<string, unknown>>;
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
      toolStrategies: [[{ name: "getFinancialMetrics" }], [{ name: "getLatestMonthlySummary" }]],
      allowedDataTools: ["getFinancialMetrics", "getLatestMonthlySummary"],
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
    },
    {
      id: "daily-expense",
      prompt: "今月10日の支出を見たい",
      toolStrategies: [[{ name: "searchTransactions", input: { date: day, type: "expense" } }]],
      allowedDataTools: ["searchTransactions"],
      navigationInput: { page: "cashFlow", month },
      expectedCardTypes: ["summary", "transactionList", "action"],
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
    },
  ];
}

export const FINANCE_CHAT_EVALUATION_CASES = createFinanceChatEvaluationCases();
