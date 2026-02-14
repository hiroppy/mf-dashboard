import { getLatestMonthlySummary } from "@mf-dashboard/db";
import { getTransactionsByMonth } from "@mf-dashboard/db";
import { Calendar } from "lucide-react";
import { formatDateShort } from "../../lib/format";
import { AmountDisplay } from "../ui/amount-display";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { MetricLabel } from "../ui/metric-label";

interface MonthlyBalanceCardProps {
  className?: string;
  groupId?: string;
}

export async function MonthlyBalanceCard({ className, groupId }: MonthlyBalanceCardProps) {
  const summary = await getLatestMonthlySummary(groupId);

  if (!summary) {
    return <EmptyState icon={Calendar} title="今月の収支" />;
  }

  const { totalIncome, totalExpense, netIncome } = summary;
  const recentTransactions = (await getTransactionsByMonth(summary.month, groupId))
    .filter((t) => !t.isTransfer && !t.isExcludedFromCalculation)
    .slice(0, 3);

  const basePath = groupId ? `/${groupId}/cf` : "/cf";

  return (
    <Card href={`${basePath}/${summary.month}/`} className={className}>
      <CardHeader>
        <CardTitle icon={Calendar}>今月の収支</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="flex justify-between text-sm">
          <MetricLabel title="収入" />
          <AmountDisplay amount={totalIncome} type="income" size="sm" />
        </div>
        <div className="flex justify-between text-sm">
          <MetricLabel title="支出" />
          <AmountDisplay amount={totalExpense} type="expense" size="sm" />
        </div>
        <div className="flex justify-between text-sm pt-1 border-t">
          <MetricLabel title="収支" />
          <AmountDisplay amount={netIncome} type="balance" size="sm" weight="bold" />
        </div>
        {recentTransactions.length > 0 && (
          <div className="pt-3 mt-2 space-y-4">
            <p className="text-sm font-bold">最近の収入・支出</p>
            <div className="space-y-2">
              {recentTransactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-muted-foreground shrink-0">
                      {formatDateShort(t.date)}
                    </span>
                    <span className="truncate">{t.description ?? t.category ?? "不明"}</span>
                  </div>
                  <AmountDisplay
                    amount={t.amount}
                    type={t.type === "income" ? "income" : "expense"}
                    size="sm"
                    className="shrink-0 ml-2"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
