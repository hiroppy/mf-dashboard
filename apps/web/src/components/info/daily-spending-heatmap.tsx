import { getTransactionsByMonth } from "@mf-dashboard/db";
import { parseMonthString } from "../../lib/calendar";
import { DailySpendingHeatmapClient } from "./daily-spending-heatmap.client";

interface DailySpendingHeatmapProps {
  month: string; // "YYYY-MM"
  groupId?: string;
}

export async function DailySpendingHeatmap({ month, groupId }: DailySpendingHeatmapProps) {
  const transactions = await getTransactionsByMonth(month, groupId);

  // Group expense amounts by date (exclude transfers)
  const dailyMap = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type === "expense" && !tx.isTransfer) {
      dailyMap.set(tx.date, (dailyMap.get(tx.date) ?? 0) + tx.amount);
    }
  }

  const dailyData = Array.from(dailyMap.entries()).map(([date, amount]) => ({
    date,
    amount,
  }));

  const { year, month: m } = parseMonthString(month);

  return (
    <DailySpendingHeatmapClient
      title="日別支出ヒートマップ"
      year={year}
      monthIndex={m - 1}
      dailyData={dailyData}
    />
  );
}
