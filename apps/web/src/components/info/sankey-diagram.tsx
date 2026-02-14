import { getMonthlyCategoryTotals } from "@mf-dashboard/db";
import { GitBranch } from "lucide-react";
import { EmptyState } from "../ui/empty-state";
import { SankeyDiagramClient } from "./sankey-diagram.client";

interface SankeyDiagramProps {
  month: string;
  groupId?: string;
}

export async function SankeyDiagram({ month, groupId }: SankeyDiagramProps) {
  const categoryTotals = await getMonthlyCategoryTotals(month, groupId);

  // Separate income and expense categories (sorted by amount desc)
  const incomeCategories = categoryTotals
    .filter((c) => c.type === "income")
    .map((c) => ({
      category: c.category,
      amount: c.totalAmount,
    }))
    .sort((a, b) => b.amount - a.amount);

  const expenseCategories = categoryTotals
    .filter((c) => c.type === "expense")
    .map((c) => ({
      category: c.category,
      amount: c.totalAmount,
    }))
    .sort((a, b) => b.amount - a.amount);

  if (incomeCategories.length === 0 && expenseCategories.length === 0) {
    return <EmptyState icon={GitBranch} title="キャッシュフロー" />;
  }

  return <SankeyDiagramClient income={incomeCategories} expense={expenseCategories} height={600} />;
}
