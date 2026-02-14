import {
  getAssetBreakdownByCategory,
  getCategoryChangesForPeriod,
  getLatestTotalAssets,
  getLiabilityBreakdownByCategory,
} from "@mf-dashboard/db";
import { PieChart } from "lucide-react";
import { EmptyState } from "../ui/empty-state";
import { AssetBreakdownChartClient } from "./asset-breakdown-chart.client";

interface AssetBreakdownChartProps {
  className?: string;
  groupId?: string;
}

export async function AssetBreakdownChart({ className, groupId }: AssetBreakdownChartProps) {
  const data = await getAssetBreakdownByCategory(groupId);

  if (data.length === 0) {
    return <EmptyState icon={PieChart} title="資産構成" />;
  }

  const totalAssets = await getLatestTotalAssets(groupId);
  const liabilities = await getLiabilityBreakdownByCategory(groupId);
  const totalLiabilities = liabilities.reduce((sum, l) => sum + l.amount, 0);
  const netAssets = totalAssets !== null ? totalAssets - totalLiabilities : null;

  const dailyChanges = await getCategoryChangesForPeriod("daily", groupId);
  const weeklyChanges = await getCategoryChangesForPeriod("weekly", groupId);
  const monthlyChanges = await getCategoryChangesForPeriod("monthly", groupId);

  return (
    <AssetBreakdownChartClient
      data={data}
      dailyChanges={dailyChanges}
      weeklyChanges={weeklyChanges}
      monthlyChanges={monthlyChanges}
      netAssets={netAssets}
      className={className}
    />
  );
}
