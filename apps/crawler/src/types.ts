import type { AssetSummary, AssetItem, CashFlowSummary } from "@mf-dashboard/db/types";

interface AccountIssue {
  name: string;
  status: "updating" | "error";
  errorMessage?: string;
}

export interface ScrapedData {
  summary: AssetSummary;
  items: AssetItem[];
  updatedAt: string;
  groupName?: string;
  accountIssues?: AccountIssue[];
}

export interface ScrapeOptions {
  skipRefresh?: boolean;
}

export interface CashFlowHistoryResult {
  month: string;
  data: CashFlowSummary;
}
