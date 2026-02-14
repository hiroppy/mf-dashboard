import { getAccountByMfId } from "@mf-dashboard/db";
import { getHoldingsByAccountId, getHoldingsWithLatestValues } from "@mf-dashboard/db";
import { TrendingUp } from "lucide-react";
import { EmptyState } from "../ui/empty-state";
import { UnrealizedGainCardClient } from "./unrealized-gain-card.client";

interface UnrealizedGainCardProps {
  className?: string;
  mfId?: string;
  groupId?: string;
}

export async function UnrealizedGainCard({ className, mfId, groupId }: UnrealizedGainCardProps) {
  const account = mfId ? await getAccountByMfId(mfId, groupId) : null;
  const holdings = account
    ? await getHoldingsByAccountId(account.id, groupId)
    : await getHoldingsWithLatestValues(groupId);
  const withGain = holdings.filter((h) => h.unrealizedGain !== null);

  if (withGain.length === 0) {
    if (mfId) return null;
    return <EmptyState icon={TrendingUp} title="含み損益" />;
  }

  const holdingsData = withGain.map((h) => ({
    name: h.name,
    amount: h.amount,
    unrealizedGain: h.unrealizedGain!,
    unrealizedGainPct: h.unrealizedGainPct,
    institution: h.institution,
    categoryName: h.categoryName,
  }));

  // 金融機関ごと、金融機関+種別ごとの保有額を集計
  const institutionTotals = new Map<string, number>();
  const institutionCategoryTotals = new Map<string, number>();

  for (const h of withGain) {
    if (h.institution) {
      institutionTotals.set(h.institution, (institutionTotals.get(h.institution) ?? 0) + h.amount);
      if (h.categoryName) {
        const key = `${h.institution}|${h.categoryName}`;
        institutionCategoryTotals.set(key, (institutionCategoryTotals.get(key) ?? 0) + h.amount);
      }
    }
  }

  // 保有額の多い順にソートした金融機関リスト
  const sortedInstitutions = [...institutionTotals.entries()].sort((a, b) => b[1] - a[1]);

  // フィルターオプションを生成: 金融機関 → 金融機関+種別 の順
  const filterOptions: { value: string; label: string }[] = [];
  for (const [inst] of sortedInstitutions) {
    filterOptions.push({ value: inst, label: inst });
    // この金融機関に属する種別を保有額順に追加
    const categoryEntries = [...institutionCategoryTotals.entries()]
      .filter(([key]) => key.startsWith(`${inst}|`))
      .sort((a, b) => b[1] - a[1]);
    for (const [key] of categoryEntries) {
      const categoryName = key.split("|")[1];
      filterOptions.push({ value: key, label: `${inst} - ${categoryName}` });
    }
  }

  return (
    <div className={className}>
      <UnrealizedGainCardClient
        holdings={holdingsData}
        filterOptions={filterOptions}
        hideFilter={!!mfId}
      />
    </div>
  );
}
