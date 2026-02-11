import type { AnalyticsMetrics, AnalyticsInsights } from "@moneyforward-daily-action/db";
import { ShoppingCart } from "lucide-react";
import { formatCurrency, formatPercent } from "../../lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { MetricLabel } from "../ui/metric-label";

interface InsightsSpendingCardProps {
  metrics: AnalyticsMetrics;
  insights: AnalyticsInsights | null;
}

export function InsightsSpendingCard({ metrics, insights }: InsightsSpendingCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle icon={ShoppingCart}>支出パターン</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <MetricLabel title="月平均支出" />
            <span className="text-lg font-semibold text-expense">
              {formatCurrency(metrics.spending.monthlyAverage)}
            </span>
          </div>
          {metrics.spending.topCategories.length > 0 && (
            <div className="space-y-2">
              <MetricLabel
                title="支出TOP3"
                description="直近12ヶ月の支出合計が大きいカテゴリ上位3件です。"
              />
              {metrics.spending.topCategories.slice(0, 3).map((cat) => (
                <div key={cat.category} className="flex items-center justify-between text-sm">
                  <span>{cat.category}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-expense">{formatCurrency(cat.amount)}</span>
                    <span className="text-xs text-muted-foreground w-10 text-right">
                      {formatPercent(cat.pct)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {metrics.spending.anomalies.length > 0 && (
            <div className="space-y-2">
              <MetricLabel
                title="異常検出"
                description="過去の平均から大きく乖離しているカテゴリです。標準偏差の2倍以上を異常と判定しています。"
              />
              {metrics.spending.anomalies.map((a) => (
                <div
                  key={a.category}
                  className="flex items-center justify-between text-sm text-balance-negative"
                >
                  <span>{a.category}</span>
                  <span>{formatCurrency(a.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {insights?.spending && (
          <p className="text-sm text-muted-foreground border-t pt-4">{insights.spending}</p>
        )}
      </CardContent>
    </Card>
  );
}
