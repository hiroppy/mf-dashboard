import type { AnalyticsMetrics, AnalyticsInsights } from "@moneyforward-daily-action/db";
import { Wallet } from "lucide-react";
import { formatCurrency, formatPercent } from "../../lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { MetricLabel } from "../ui/metric-label";

interface InsightsBalanceCardProps {
  metrics: AnalyticsMetrics;
  insights: AnalyticsInsights | null;
}

function balanceColor(value: number) {
  return value >= 0 ? "text-balance-positive" : "text-balance-negative";
}

export function InsightsBalanceCard({ metrics, insights }: InsightsBalanceCardProps) {
  const monthlyNetBalance = metrics.balance.monthlyIncome - metrics.balance.monthlyExpense;
  const latestBalance = metrics.balance.trend.at(-1)?.balance ?? 0;
  const last3 = metrics.balance.trend.slice(-3);
  const threeMonthAvgBalance =
    last3.length > 0 ? Math.round(last3.reduce((s, m) => s + m.balance, 0) / last3.length) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle icon={Wallet}>収支バランス</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <MetricLabel title="月平均収入" />
            <div className="text-xl font-semibold text-income">
              {formatCurrency(metrics.balance.monthlyIncome)}
            </div>
          </div>
          <div>
            <MetricLabel title="月平均支出" />
            <div className="text-xl font-semibold text-expense">
              {formatCurrency(metrics.balance.monthlyExpense)}
            </div>
          </div>
          <div>
            <MetricLabel
              title="貯蓄率"
              description={
                <div className="space-y-1">
                  <div className="font-medium">(月平均収入 − 月平均支出) ÷ 月平均収入 × 100</div>
                  <div>収入のうち貯蓄に回せている割合です。20%以上が理想的とされます。</div>
                </div>
              }
            />
            <div className={`text-xl font-semibold ${balanceColor(metrics.balance.savingsRate)}`}>
              {formatPercent(metrics.balance.savingsRate)}
            </div>
          </div>
          <div>
            <MetricLabel
              title="月平均収支"
              description="月平均収入 − 月平均支出。毎月の手残り額です。"
            />
            <div className={`text-xl font-semibold ${balanceColor(monthlyNetBalance)}`}>
              {formatCurrency(monthlyNetBalance)}
            </div>
          </div>
          <div>
            <MetricLabel
              title="直近月の純収入"
              description="最新月の収入から支出を引いた額です。"
            />
            <div className={`text-xl font-semibold ${balanceColor(latestBalance)}`}>
              {formatCurrency(latestBalance)}
            </div>
          </div>
          <div>
            <MetricLabel
              title="3ヶ月平均純収入"
              description="直近3ヶ月の純収入（収入−支出）の平均額です。"
            />
            <div className={`text-xl font-semibold ${balanceColor(threeMonthAvgBalance)}`}>
              {formatCurrency(threeMonthAvgBalance)}
            </div>
          </div>
        </div>
        {insights?.balance && (
          <p className="text-sm text-muted-foreground border-t pt-4">{insights.balance}</p>
        )}
      </CardContent>
    </Card>
  );
}
