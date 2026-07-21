import { hasInvestmentHoldings } from "@mf-dashboard/db";
import type { Metadata } from "next";
import { AssetBreakdownChart } from "../components/info/asset-breakdown-chart";
import { AssetHistoryChart } from "../components/info/asset-history-chart";
import { DailyChangeCard } from "../components/info/daily-change-card";
import { MonthlyBalanceCard } from "../components/info/monthly-balance-card";
import { MonthlyIncomeExpenseChart } from "../components/info/monthly-income-expense-chart";
import { DashboardLayout } from "../components/layout/dashboard-layout";

export const metadata: Metadata = {
  title: "ダッシュボード",
};

export async function DashboardContent({ groupId }: { groupId?: string }) {
  const showDailyChange = await hasInvestmentHoldings(groupId);

  return (
    <DashboardLayout
      overview={
        <>
          <AssetBreakdownChart className="lg:col-span-2" groupId={groupId} />
          <MonthlyBalanceCard groupId={groupId} />
        </>
      }
      dailyChange={showDailyChange ? <DailyChangeCard groupId={groupId} /> : undefined}
      assetHistory={<AssetHistoryChart groupId={groupId} />}
      cashFlow={<MonthlyIncomeExpenseChart groupId={groupId} />}
    />
  );
}

export default function DashboardPage() {
  return <DashboardContent />;
}
