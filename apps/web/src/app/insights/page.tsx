import type { Metadata } from "next";
import { InsightsContent } from "./insights-content";

export const metadata: Metadata = {
  title: "財務インサイト",
};

export default function InsightsPage() {
  return <InsightsContent />;
}
