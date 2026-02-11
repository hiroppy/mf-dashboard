export interface AnalyticsInsights {
  summary: string | null;
  savingsInsight: string | null;
  investmentInsight: string | null;
  spendingInsight: string | null;
  balanceInsight: string | null;
  liabilityInsight: string | null;
}

export interface AnalyticsReport {
  groupId: string;
  date: string;
  insights: AnalyticsInsights | null;
  model: string | null;
}
