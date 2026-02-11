import type { AnalyticsMetrics, AnalyticsInsights } from "@moneyforward-daily-action/db";
import { Landmark } from "lucide-react";
import { formatCurrency, formatPercent } from "../../lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { MetricLabel } from "../ui/metric-label";

interface InsightsLiabilityCardProps {
  metrics: AnalyticsMetrics;
  insights: AnalyticsInsights | null;
}

function ratioColor(ratio: number) {
  if (ratio < 10) return "text-balance-positive";
  if (ratio < 30) return "text-warning-foreground";
  return "text-balance-negative";
}

export function InsightsLiabilityCard({ metrics, insights }: InsightsLiabilityCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle icon={Landmark}>負債分析</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <MetricLabel title="負債総額" />
            <div className="text-xl font-semibold text-balance-negative">
              {formatCurrency(metrics.liability.totalLiabilities)}
            </div>
          </div>
          <div>
            <MetricLabel
              title="資産負債比率"
              description="負債総額 ÷ 総資産 × 100。低いほど財務的に健全です。"
            />
            <div
              className={`text-xl font-semibold ${ratioColor(metrics.liability.debtToAssetRatio)}`}
            >
              {formatPercent(metrics.liability.debtToAssetRatio)}
            </div>
          </div>
        </div>
        {metrics.liability.byCategory.length > 0 && (
          <div className="space-y-2">
            <MetricLabel title="カテゴリ別内訳" />
            <div className="space-y-1">
              {metrics.liability.byCategory.map((cat) => (
                <div key={cat.category} className="flex items-center justify-between text-sm">
                  <span>{cat.category}</span>
                  <span className="text-balance-negative">
                    {formatCurrency(cat.amount)} ({formatPercent(cat.pct)})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {insights?.liability && (
          <p className="text-sm text-muted-foreground border-t pt-4">{insights.liability}</p>
        )}
      </CardContent>
    </Card>
  );
}
