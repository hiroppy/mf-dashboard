import { getAccountByMfId } from "@mf-dashboard/db";
import { getHoldingsByAccountId } from "@mf-dashboard/db";
import { WalletIcon } from "lucide-react";
import { AmountDisplay } from "../ui/amount-display";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { MetricLabel } from "../ui/metric-label";

interface AccountSummaryCardProps {
  mfId: string;
  groupId?: string;
}

export async function AccountSummaryCard({ mfId, groupId }: AccountSummaryCardProps) {
  const account = await getAccountByMfId(mfId, groupId);

  if (!account) {
    return <EmptyState icon={WalletIcon} title="サマリー" />;
  }

  const holdings = await getHoldingsByAccountId(account.id, groupId);
  const assets = holdings.filter((h) => h.type === "asset" && h.amount);
  const liabilities = holdings.filter((h) => h.type === "liability" && h.amount);

  const holdingsTotal = assets.reduce((sum, h) => sum + (h.amount || 0), 0);
  const liabilitiesTotal = liabilities.reduce((sum, h) => sum + (h.amount || 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle icon={WalletIcon}>サマリー</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <MetricLabel title="総資産" />
            <div>
              <AmountDisplay amount={account.totalAssets} size="2xl" weight="bold" />
            </div>
          </div>
          {holdingsTotal > 0 && (
            <div>
              <MetricLabel title="保有資産" />
              <div>
                <AmountDisplay amount={holdingsTotal} size="xl" weight="semibold" />
              </div>
            </div>
          )}
          {liabilitiesTotal > 0 && (
            <div>
              <MetricLabel title="負債" />
              <div>
                <AmountDisplay
                  amount={-liabilitiesTotal}
                  type="balance"
                  size="xl"
                  weight="semibold"
                />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
