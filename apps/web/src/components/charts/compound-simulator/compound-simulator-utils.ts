import type { YearlyProjection } from "./calculate-compound";
import type { MonteCarloYearData } from "./simulate-monte-carlo";

export function getLabelMap(taxFree: boolean): Record<string, string> {
  return {
    principal: "元本",
    interest: taxFree ? "運用益" : "運用益（税引後）",
    tax: "税金",
  };
}

export const MILESTONE_CANDIDATES = [10_000_000, 20_000_000, 50_000_000, 100_000_000, 200_000_000];

export function selectMilestones(maxValue: number): number[] {
  const candidates = MILESTONE_CANDIDATES.filter((m) => m < maxValue * 0.95 && m > maxValue * 0.05);
  return candidates.slice(0, 2);
}

export function getTimelinePattern(
  contributionYears: number,
  withdrawalStartYear: number,
  withdrawalYears: number,
): string {
  const parts: string[] = [];
  if (contributionYears > 0) parts.push(`積立${contributionYears}年`);
  const gap = withdrawalStartYear - contributionYears;
  if (gap > 0 && withdrawalYears > 0) parts.push(`据え置き${gap}年`);
  if (withdrawalYears > 0) parts.push(`切り崩し${withdrawalYears}年`);
  if (parts.length === 0) return "積立のみ";

  let label: string;
  if (contributionYears === 0 && withdrawalStartYear === 0) label = "切り崩しのみ";
  else if (withdrawalStartYear < contributionYears && withdrawalYears > 0) label = "積立+切り崩し";
  else if (gap > 0 && withdrawalYears > 0) label = "積立 → 据え置き → 切り崩し";
  else if (withdrawalYears > 0) label = "積立 → 切り崩し";
  else label = "積立のみ";

  return `${label}（${parts.join("・")}）`;
}

export function computeSummaryYear(
  contributionYears: number,
  withdrawalStartYear: number,
  withdrawalYears: number,
): number {
  return withdrawalYears > 0 ? withdrawalStartYear : contributionYears;
}

export function computeMonthlyWithdrawalForSummary(
  mode: "rate" | "amount",
  projections: YearlyProjection[],
  withdrawalStartYear: number,
  fixedAmount: number,
): number {
  if (mode === "rate") {
    return Math.round(
      (projections.find((p) => p.year === withdrawalStartYear + 1)?.yearlyWithdrawal ?? 0) / 12,
    );
  }
  return fixedAmount;
}

export function computeMcDrawdownEndValue(
  withdrawalYears: number,
  yearlyData: MonteCarloYearData[],
  percentile: "p10" | "p25" | "p50" | "p75" | "p90",
): number | undefined {
  return withdrawalYears > 0
    ? yearlyData.filter((d) => d.isWithdrawing).at(-1)?.[percentile]
    : undefined;
}

export function computeTotalWithdrawalAmount(
  withdrawalYears: number,
  projections: YearlyProjection[],
): number {
  if (withdrawalYears <= 0) return 0;
  return projections.filter((p) => p.isWithdrawing).reduce((sum, p) => sum + p.yearlyWithdrawal, 0);
}

interface FanChartDataPoint {
  year: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  principal: number;
  isContributing: boolean;
  isWithdrawing: boolean;
  depletionRate?: number;
  base: number;
  band_outer_lower: number;
  band_inner_lower: number;
  band_inner_upper: number;
  band_outer_upper: number;
}

export function buildFanChartData(yearlyData: MonteCarloYearData[]): FanChartDataPoint[] {
  return yearlyData.map((d) => ({
    year: d.year,
    p10: d.p10,
    p25: d.p25,
    p50: d.p50,
    p75: d.p75,
    p90: d.p90,
    principal: d.principal,
    isContributing: d.isContributing,
    isWithdrawing: d.isWithdrawing,
    depletionRate: d.depletionRate,
    base: d.p10,
    band_outer_lower: d.p25 - d.p10,
    band_inner_lower: d.p50 - d.p25,
    band_inner_upper: d.p75 - d.p50,
    band_outer_upper: d.p90 - d.p75,
  }));
}

export function computeWithdrawalMilestones(
  withdrawalYears: number,
  withdrawalStartYear: number,
  projections: YearlyProjection[],
): { year: number; annual: number }[] | undefined {
  if (withdrawalYears < 10) return undefined;
  const offsets = withdrawalYears >= 20 ? [10, 20] : [Math.floor(withdrawalYears / 2)];
  return offsets
    .map((y) => {
      const proj = projections.find((p) => p.year === withdrawalStartYear + y);
      return proj ? { year: y, annual: proj.yearlyWithdrawal } : null;
    })
    .filter((m): m is { year: number; annual: number } => m != null);
}

export function computeTotalYears(
  contributionYears: number,
  withdrawalStartYear: number,
  withdrawalYears: number,
): number {
  return Math.max(contributionYears, withdrawalStartYear + withdrawalYears);
}

export function computeSecurityScore(
  depletionProbability: number,
  failureProbability?: number,
  medianIsZero?: boolean,
): number {
  // ベース: 枯渇しない確率
  let score = (1 - depletionProbability) * 100;
  // 元本割れ確率が高い場合にペナルティ（最大-20pt）
  if (failureProbability != null) {
    score -= failureProbability * 20;
  }
  // 中央値が0（半数以上が枯渇）の場合、上限を10に制限
  if (medianIsZero) {
    score = Math.min(score, 10);
  }
  return Math.round(Math.max(0, Math.min(100, score)));
}

export type SecurityLevel = "safe" | "caution" | "warning" | "danger";

export function getSecurityLabel(score: number): { label: string; level: SecurityLevel } {
  if (score >= 95) return { label: "非常に安心", level: "safe" };
  if (score >= 80) return { label: "安心", level: "safe" };
  if (score >= 60) return { label: "やや注意", level: "caution" };
  if (score >= 40) return { label: "注意", level: "warning" };
  return { label: "要見直し", level: "danger" };
}
