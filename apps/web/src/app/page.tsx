import type { Metadata } from "next";
import { hasInvestmentHoldings } from "@mf-dashboard/db";
import { AssetBreakdownChart } from "../components/info/asset-breakdown-chart";
import { AssetHistoryChart } from "../components/info/asset-history-chart";
import { DailyChangeCard } from "../components/info/daily-change-card";
import { MonthlyBalanceCard } from "../components/info/monthly-balance-card";
import { MonthlyIncomeExpenseChart } from "../components/info/monthly-income-expense-chart";
import { PageLayout } from "../components/layout/page-layout";

export const metadata: Metadata = {
  title: "ダッシュボード",
};

export async function DashboardContent({ groupId }: { groupId?: string }) {
  const showDailyChange = await hasInvestmentHoldings(groupId);

  return (
    <PageLayout title="ダッシュボード">
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <AssetBreakdownChart className="lg:col-span-2" groupId={groupId} />
        <MonthlyBalanceCard groupId={groupId} />
      </div>

      {showDailyChange && <DailyChangeCard groupId={groupId} />}

      <AssetHistoryChart groupId={groupId} />

      <MonthlyIncomeExpenseChart groupId={groupId} />
    </PageLayout>
  );
}

export default function DashboardPage() {
  return <DashboardContent />;
}
