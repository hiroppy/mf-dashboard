import { getMonthlySummaries } from "@mf-dashboard/db";
import { TrendingUp } from "lucide-react";
import { EmptyState } from "../ui/empty-state";
import { MonthlyIncomeExpenseChartClient } from "./monthly-income-expense-chart.client";

interface MonthlyIncomeExpenseChartProps {
  groupId?: string;
}

export async function MonthlyIncomeExpenseChart({ groupId }: MonthlyIncomeExpenseChartProps) {
  const data = await getMonthlySummaries({ limit: 12, groupId });

  if (data.length === 0) {
    return <EmptyState icon={TrendingUp} title="月別収支推移" />;
  }

  return <MonthlyIncomeExpenseChartClient data={data} groupId={groupId} />;
}
