import type { Metadata } from "next";
import { getHoldingsWithLatestValues } from "@mf-dashboard/db";
import { CompoundSimulator } from "../../components/charts/compound-simulator/compound-simulator";
import { PageLayout } from "../../components/layout/page-layout";

export const metadata: Metadata = {
  title: "シミュレーター",
};

export async function SimulatorContent({ groupId }: { groupId?: string }) {
  const holdings = await getHoldingsWithLatestValues(groupId);
  const investmentHoldings = holdings.filter(
    (h) => h.categoryName && h.categoryName.includes("投資信託"),
  );
  const totalInvestment = investmentHoldings.reduce((sum, h) => sum + (h.amount ?? 0), 0);

  const isDemo = process.env.DEMO_MODE === "true";

  return (
    <PageLayout title="シミュレーター">
      <CompoundSimulator
        defaultInitialAmount={isDemo ? 0 : totalInvestment}
        portfolioContext={
          isDemo
            ? undefined
            : {
                initialAmountSource: "あなたの投資総額",
              }
        }
      />
    </PageLayout>
  );
}

export default function SimulatorPage() {
  return <SimulatorContent />;
}
