import { getHoldingsWithDailyChange } from "@mf-dashboard/db";
import { ArrowUpDown } from "lucide-react";
import { EmptyState } from "../ui/empty-state";
import { DailyChangeCardClient } from "./daily-change-card.client";

interface DailyChangeCardProps {
  className?: string;
  groupId?: string;
}

export async function DailyChangeCard({ className, groupId }: DailyChangeCardProps) {
  const holdings = await getHoldingsWithDailyChange(groupId);

  if (holdings.length === 0) {
    return <EmptyState icon={ArrowUpDown} title="前日比ランキング" />;
  }

  const holdingsData = holdings.map((h) => ({
    name: h.name,
    code: h.code,
    categoryName: h.categoryName,
    accountName: h.accountName,
    dailyChange: h.dailyChange,
  }));

  return (
    <div className={className}>
      <DailyChangeCardClient holdings={holdingsData} />
    </div>
  );
}
