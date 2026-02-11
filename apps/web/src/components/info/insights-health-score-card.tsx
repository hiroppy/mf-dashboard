import type { AnalyticsMetrics } from "@moneyforward-daily-action/db";
import { Shield } from "lucide-react";
import { RadarChart } from "../charts/radar-chart";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

interface InsightsHealthScoreCardProps {
  metrics: AnalyticsMetrics;
}

function scoreColor(score: number) {
  if (score >= 80) return "text-balance-positive";
  if (score >= 60) return "text-yellow-700";
  return "text-balance-negative";
}

export function InsightsHealthScoreCard({ metrics }: InsightsHealthScoreCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle icon={Shield}>財務健全性スコア</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="flex items-baseline gap-1 justify-center">
          <span className={`text-5xl font-bold ${scoreColor(metrics.healthScore.totalScore)}`}>
            {Math.round(metrics.healthScore.totalScore)}
          </span>
          <span className="text-xl text-muted-foreground">/ 100</span>
        </div>
        <RadarChart categories={metrics.healthScore.categories} />
      </CardContent>
    </Card>
  );
}
