import type { HoldingInfo, DailyChangeInfo, PortfolioRiskResult } from "./analyzer-types";

function aggregateHoldingsByName(holdings: HoldingInfo[]): HoldingInfo[] {
  const totals = new Map<string, { amount: number; unrealizedGain: number }>();

  for (const holding of holdings) {
    const total = totals.get(holding.name) ?? { amount: 0, unrealizedGain: 0 };
    total.amount += holding.amount;
    total.unrealizedGain += holding.unrealizedGain;
    totals.set(holding.name, total);
  }

  return [...totals].map(([name, total]) => {
    const costBasis = total.amount - total.unrealizedGain;
    return {
      name,
      amount: total.amount,
      unrealizedGain: total.unrealizedGain,
      unrealizedGainPct: costBasis > 0 ? (total.unrealizedGain / costBasis) * 100 : 0,
    };
  });
}

function aggregateDailyChangesByName(changes: DailyChangeInfo[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const change of changes) {
    totals.set(change.name, (totals.get(change.name) ?? 0) + change.dailyChange);
  }
  return totals;
}

export function analyzePortfolioRisk(
  holdings: HoldingInfo[],
  holdingsWithDailyChange: DailyChangeInfo[],
  diversificationScore: number,
): PortfolioRiskResult {
  if (holdings.length === 0) {
    return {
      topConcentration: { names: [], totalPct: 0 },
      maxHolding: null,
      volatileHoldings: [],
      riskLevel: "low",
      maxGainHolding: null,
      maxLossHolding: null,
      totalDailyChange: 0,
      totalDailyChangePct: 0,
      holdingsCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      totalUnrealizedGain: 0,
      totalUnrealizedGainPct: 0,
    };
  }

  const aggregatedHoldings = aggregateHoldingsByName(holdings);

  const totalValue = aggregatedHoldings.reduce((s, h) => s + h.amount, 0);
  const totalUnrealizedGain = aggregatedHoldings.reduce((s, h) => s + h.unrealizedGain, 0);
  const costBasis = totalValue - totalUnrealizedGain;
  const totalUnrealizedGainPct = costBasis > 0 ? (totalUnrealizedGain / costBasis) * 100 : 0;

  // Concentration
  const sorted = [...aggregatedHoldings].sort((a, b) => b.amount - a.amount);
  const top3 = sorted.slice(0, 3);
  const top3Pct = totalValue > 0 ? (top3.reduce((s, h) => s + h.amount, 0) / totalValue) * 100 : 0;

  const maxHolding =
    sorted.length > 0 && totalValue > 0
      ? { name: sorted[0].name, pct: (sorted[0].amount / totalValue) * 100 }
      : null;

  // Daily change analysis
  const dailyChangeMap = aggregateDailyChangesByName(holdingsWithDailyChange);
  const totalDailyChange = [...dailyChangeMap.values()].reduce((sum, change) => sum + change, 0);
  const totalDailyChangePct = totalValue > 0 ? (totalDailyChange / totalValue) * 100 : 0;

  const volatileHoldings = aggregatedHoldings
    .map((h) => {
      const dailyChange = dailyChangeMap.get(h.name) ?? 0;
      const portfolioImpactPct = totalValue > 0 ? (Math.abs(dailyChange) / totalValue) * 100 : 0;
      return { name: h.name, dailyChange, portfolioImpactPct };
    })
    .filter((h) => h.dailyChange !== 0)
    .sort((a, b) => Math.abs(b.dailyChange) - Math.abs(a.dailyChange))
    .slice(0, 5);

  // Risk level
  let riskLevel: "low" | "moderate" | "high" = "low";
  if (diversificationScore < 30 || top3Pct > 80) {
    riskLevel = "high";
  } else if (diversificationScore < 60 || top3Pct > 60) {
    riskLevel = "moderate";
  }

  // Gain/loss counts
  const positiveCount = aggregatedHoldings.filter((h) => h.unrealizedGain > 0).length;
  const negativeCount = aggregatedHoldings.filter((h) => h.unrealizedGain < 0).length;

  // Max gain/loss
  const withGains = aggregatedHoldings.filter((h) => h.unrealizedGain > 0);
  const withLosses = aggregatedHoldings.filter((h) => h.unrealizedGain < 0);

  const maxGainHolding =
    withGains.length > 0 ? withGains.sort((a, b) => b.unrealizedGain - a.unrealizedGain)[0] : null;
  const maxLossHolding =
    withLosses.length > 0
      ? withLosses.sort((a, b) => a.unrealizedGain - b.unrealizedGain)[0]
      : null;

  return {
    topConcentration: { names: top3.map((h) => h.name), totalPct: top3Pct },
    maxHolding,
    volatileHoldings,
    riskLevel,
    maxGainHolding: maxGainHolding
      ? {
          name: maxGainHolding.name,
          unrealizedGain: maxGainHolding.unrealizedGain,
          unrealizedGainPct: maxGainHolding.unrealizedGainPct,
        }
      : null,
    maxLossHolding: maxLossHolding
      ? {
          name: maxLossHolding.name,
          unrealizedGain: maxLossHolding.unrealizedGain,
          unrealizedGainPct: maxLossHolding.unrealizedGainPct,
        }
      : null,
    totalDailyChange,
    totalDailyChangePct,
    holdingsCount: aggregatedHoldings.length,
    positiveCount,
    negativeCount,
    totalUnrealizedGain,
    totalUnrealizedGainPct,
  };
}
