import type { AnalyticsMetrics, AnalyticsInsights } from "@moneyforward-daily-action/db";
import { TrendingUp } from "lucide-react";
import { formatCurrency, formatPercent } from "../../lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { MetricLabel } from "../ui/metric-label";

interface InsightsInvestmentCardProps {
  metrics: AnalyticsMetrics;
  insights: AnalyticsInsights | null;
}

function balanceColor(value: number) {
  return value >= 0 ? "text-balance-positive" : "text-balance-negative";
}

export function InsightsInvestmentCard({ metrics, insights }: InsightsInvestmentCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle icon={TrendingUp}>投資パフォーマンス</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <MetricLabel title="投資総額" />
            <div className="text-xl font-semibold">
              {formatCurrency(metrics.investment.totalInvestment)}
            </div>
          </div>
          <div>
            <MetricLabel
              title="含み損益"
              description="現在の評価額と取得価額の差額です。売却するまで確定しません。"
            />
            <div
              className={`text-xl font-semibold ${balanceColor(metrics.investment.totalUnrealizedGain)}`}
            >
              {formatCurrency(metrics.investment.totalUnrealizedGain)}
            </div>
          </div>
          <div>
            <MetricLabel
              title="含み損益率"
              description="含み損益 ÷ 取得価額 × 100。投資元本に対するリターンの割合です。"
            />
            <div
              className={`text-xl font-semibold ${balanceColor(metrics.investment.totalUnrealizedGainPct)}`}
            >
              {formatPercent(metrics.investment.totalUnrealizedGainPct)}
            </div>
          </div>
          <div>
            <MetricLabel
              title="銘柄分散度"
              description="保有銘柄間の金額配分の偏りを0〜100で評価します。高いほど特定銘柄への集中が少なく、均等に分散されていることを示します。地域やセクターの分散は含みません。"
            />
            <div className="text-xl font-semibold">
              {metrics.investment.diversificationScore}/100
            </div>
          </div>
        </div>
        {insights?.investment && (
          <p className="text-sm text-muted-foreground border-t pt-4">{insights.investment}</p>
        )}
      </CardContent>
    </Card>
  );
}
