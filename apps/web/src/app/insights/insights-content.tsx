import { getLatestAnalytics } from "@mf-dashboard/db";
import { Lightbulb } from "lucide-react";
import { InsightsBalanceCard } from "../../components/info/insights-balance-card";
import { InsightsHealthScoreCard } from "../../components/info/insights-health-score-card";
import { InsightsInvestmentCard } from "../../components/info/insights-investment-card";
import { InsightsLiabilityCard } from "../../components/info/insights-liability-card";
import { InsightsSavingsCard } from "../../components/info/insights-savings-card";
import { InsightsSpendingCard } from "../../components/info/insights-spending-card";
import { PageLayout } from "../../components/layout/page-layout";
import { Card, CardContent } from "../../components/ui/card";

interface InsightsContentProps {
  groupId?: string;
}

export async function InsightsContent({ groupId }: InsightsContentProps) {
  const analytics = await getLatestAnalytics(groupId);

  if (!analytics) {
    return (
      <PageLayout title="財務インサイト">
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Lightbulb className="mx-auto h-12 w-12 mb-4 opacity-50" />
            <p>分析データがありません。</p>
            <p className="text-sm mt-2">Crawler を実行すると財務分析が利用できます。</p>
          </CardContent>
        </Card>
      </PageLayout>
    );
  }

  const { metrics, insights, date } = analytics;

  return (
    <PageLayout
      title="財務インサイト"
      options={date && <span className="text-sm text-muted-foreground">分析日: {date}</span>}
    >
      {insights?.summary && (
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <p className="text-sm">{insights.summary}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <InsightsSavingsCard metrics={metrics} insights={insights} />
        <InsightsHealthScoreCard metrics={metrics} />
        <InsightsBalanceCard metrics={metrics} insights={insights} />
        <InsightsSpendingCard metrics={metrics} insights={insights} />
        <InsightsInvestmentCard metrics={metrics} insights={insights} />
        <InsightsLiabilityCard metrics={metrics} insights={insights} />
      </div>
    </PageLayout>
  );
}
