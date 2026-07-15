export interface PortfolioContext {
  initialAmountSource?: string;
  monthlyContributionSource?: string;
  annualReturnRateSource?: string;
  currentTotalAssets?: number;
  savingsRate?: number;
}

export type WithdrawalMode = "rate" | "amount";

export type DrawdownPercentile = "p10" | "p25" | "p50" | "p75" | "p90";
