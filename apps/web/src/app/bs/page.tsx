import { hasInvestmentHoldings } from "@mf-dashboard/db";
import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Metadata } from "next";
import { AssetHistoryChart } from "../../components/info/asset-history-chart";
import { BalanceSheetChart } from "../../components/info/balance-sheet-chart";
import { HoldingsTable } from "../../components/info/holdings-table";
import { UnrealizedGainCard } from "../../components/info/unrealized-gain-card";
import { HoldingsFilterProvider } from "../../components/info/unrealized-gain-card.client";
import { PageLayout } from "../../components/layout/page-layout";

export const metadata: Metadata = {
  title: "資産",
};

export async function BSContent({ groupId }: { groupId?: string }) {
  const showUnrealizedGain = await hasInvestmentHoldings(groupId);

  return (
    <PageLayout title="資産" href={mfUrls.portfolio}>
      <BalanceSheetChart groupId={groupId} />
      <AssetHistoryChart groupId={groupId} />
      <HoldingsFilterProvider>
        {showUnrealizedGain && <UnrealizedGainCard groupId={groupId} />}
        <HoldingsTable type="asset" groupId={groupId} enableSharedFilter />
      </HoldingsFilterProvider>
      <HoldingsTable type="liability" groupId={groupId} />
    </PageLayout>
  );
}

export default function BSPage() {
  return <BSContent />;
}
