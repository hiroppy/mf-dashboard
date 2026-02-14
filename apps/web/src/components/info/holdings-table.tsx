import { getAccountByMfId } from "@mf-dashboard/db";
import { getLatestTotalAssets } from "@mf-dashboard/db";
import { getHoldingsByAccountId, getHoldingsWithLatestValues } from "@mf-dashboard/db";
import { LucideIcon, PiggyBankIcon, LandmarkIcon } from "lucide-react";
import { AmountDisplay } from "../ui/amount-display";
import { Card, CardHeader, CardTitle } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { HoldingsTableClient } from "./holdings-table.client";

interface HoldingsTableProps {
  type: "asset" | "liability";
  icon?: LucideIcon;
  mfId?: string;
  groupId?: string;
}

const CONFIG = {
  asset: {
    title: "保有資産",
    icon: PiggyBankIcon,
  },
  liability: {
    title: "負債",
    icon: LandmarkIcon,
  },
} as const;

export async function HoldingsTable({ type, icon, mfId, groupId }: HoldingsTableProps) {
  const account = mfId ? await getAccountByMfId(mfId, groupId) : null;
  const allHoldings = account
    ? await getHoldingsByAccountId(account.id, groupId)
    : await getHoldingsWithLatestValues(groupId);
  const holdings = allHoldings.filter((h) => h.type === type && h.amount);

  const config = CONFIG[type];
  const Icon = icon ?? config.icon;

  if (holdings.length === 0) {
    if (mfId) return null;
    return <EmptyState icon={Icon} title={config.title} />;
  }

  // Calculate total based on type
  let total: number;
  if (mfId) {
    total = holdings.reduce((sum, h) => sum + (h.amount || 0), 0);
  } else if (type === "asset") {
    // Use asset_history for total assets
    total =
      (await getLatestTotalAssets(groupId)) ??
      holdings.reduce((sum, h) => sum + (h.amount || 0), 0);
  } else {
    // For liabilities, sum from holdings
    total = holdings.reduce((sum, h) => sum + (h.amount || 0), 0);
  }

  // Group holdings by category
  const grouped = holdings.reduce<
    Record<
      string,
      Array<{
        id: number;
        name: string;
        accountName: string | null;
        amount: number | null;
        unrealizedGain: number | null;
        unrealizedGainPct: number | null;
        dailyChange: number | null;
        avgCostPrice: number | null;
        quantity: number | null;
        unitPrice: number | null;
      }>
    >
  >((acc, holding) => {
    const category =
      holding.type === "liability"
        ? holding.liabilityCategory || "その他"
        : holding.categoryName || "その他";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push({
      id: holding.id,
      name: holding.name,
      accountName: holding.accountName,
      amount: holding.amount,
      unrealizedGain: holding.unrealizedGain,
      unrealizedGainPct: holding.unrealizedGainPct,
      dailyChange: holding.dailyChange,
      avgCostPrice: holding.avgCostPrice,
      quantity: holding.quantity,
      unitPrice: holding.unitPrice,
    });
    return acc;
  }, {});

  const categories = Object.entries(grouped)
    .map(([category, items]) => ({
      category,
      items: items.sort((a, b) => (b.amount || 0) - (a.amount || 0)),
      total: items.reduce((sum, h) => sum + (h.amount || 0), 0),
    }))
    .sort((a, b) => b.total - a.total);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle icon={Icon}>{config.title}</CardTitle>
          <AmountDisplay amount={total} size="lg" weight="bold" />
        </div>
      </CardHeader>
      <HoldingsTableClient categories={categories} hideAccountName={!!mfId} />
    </Card>
  );
}
