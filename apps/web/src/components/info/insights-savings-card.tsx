import type { AnalyticsMetrics, AnalyticsInsights } from "@moneyforward-daily-action/db";
import { PiggyBank } from "lucide-react";
import { formatCurrency, formatPercent } from "../../lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { MetricLabel } from "../ui/metric-label";

interface InsightsSavingsCardProps {
  metrics: AnalyticsMetrics;
  insights: AnalyticsInsights | null;
}

export function InsightsSavingsCard({ metrics, insights }: InsightsSavingsCardProps) {
  const growthColor =
    metrics.growth.monthlyGrowthRate >= 0 ? "text-balance-positive" : "text-balance-negative";

  return (
    <Card>
      <CardHeader>
        <CardTitle icon={PiggyBank}>貯蓄健全性</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <MetricLabel title="総資産" />
            <div className="text-xl font-semibold">
              {formatCurrency(metrics.savings.totalAssets)}
            </div>
          </div>
          <div>
            <MetricLabel
              title="流動資産"
              description="預金・現金・暗号資産、電子マネー・プリペイドなど、すぐに現金化できる資産の合計です。"
            />
            <div className="text-xl font-semibold">
              {formatCurrency(metrics.savings.liquidAssets)}
            </div>
          </div>
          <div>
            <MetricLabel
              title="月平均支出"
              description="直近12ヶ月の支出合計を月数で割った平均値です。"
            />
            <div className="text-xl font-semibold text-expense">
              {formatCurrency(metrics.savings.monthlyExpenseAvg)}
            </div>
          </div>
          <div>
            <MetricLabel
              title="緊急予備資金"
              description={
                <div className="space-y-1">
                  <div className="font-medium">流動資産 ÷ 月平均支出</div>
                  <div>
                    収入がゼロになった場合に、現在の流動資産（預金・現金等）で何ヶ月生活できるかを示します。一般的に6ヶ月分以上が目安です。
                  </div>
                </div>
              }
            />
            <div className="text-xl font-semibold">
              {metrics.savings.emergencyFundMonths.toFixed(1)}ヶ月分
            </div>
          </div>
          <div>
            <MetricLabel
              title="流動性比率"
              description="流動資産 ÷ 総資産 × 100。すぐに現金化できる資産の割合を示します。"
            />
            <div className="text-xl font-semibold">
              {metrics.savings.totalAssets > 0
                ? formatPercent((metrics.savings.liquidAssets / metrics.savings.totalAssets) * 100)
                : "—"}
            </div>
          </div>
          <div>
            <MetricLabel title="月次成長率" description="直近の総資産の月間変化率です。" />
            <div className={`text-xl font-semibold ${growthColor}`}>
              {formatPercent(metrics.growth.monthlyGrowthRate * 100)}
            </div>
          </div>
        </div>
        {insights?.savings && (
          <p className="text-sm text-muted-foreground border-t pt-4">{insights.savings}</p>
        )}
      </CardContent>
    </Card>
  );
}
