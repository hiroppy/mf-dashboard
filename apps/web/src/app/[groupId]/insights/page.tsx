import type { Metadata } from "next";
import { InsightsContent } from "../../insights/insights-content";

export const metadata: Metadata = {
  title: "財務インサイト",
};

export default async function GroupInsightsPage({ params }: PageProps<"/[groupId]/insights">) {
  const { groupId } = await params;

  return <InsightsContent groupId={groupId} />;
}
