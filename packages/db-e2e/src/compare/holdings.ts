import type { Portfolio } from "@mf-dashboard/db/types";

export interface HoldingSummary {
  totalAssets: number;
  items: Array<{ name: string; amount: number }>;
}

export interface HoldingComparison {
  totalAssetsMatch: boolean;
  itemCountMatch: boolean;
  itemMatches: Array<{
    name: string;
    scrapedAmount: number | null;
    dbAmount: number | null;
    matches: boolean;
  }>;
}

export function summarizePortfolio(portfolio: Portfolio): HoldingSummary {
  return {
    totalAssets: portfolio.totalAssets,
    items: portfolio.items.map((item) => ({
      name: item.name,
      amount: item.balance || 0,
    })),
  };
}

function aggregateAmounts(items: HoldingSummary["items"]): Map<string, number> {
  const amounts = new Map<string, number>();
  for (const item of items) {
    amounts.set(item.name, (amounts.get(item.name) ?? 0) + item.amount);
  }
  return amounts;
}

export function compareHoldingSummaries(
  scraped: HoldingSummary,
  db: HoldingSummary,
  totalAssetsThreshold = 100,
): HoldingComparison {
  const scrapedAmounts = aggregateAmounts(scraped.items);
  const dbAmounts = aggregateAmounts(db.items);
  const names = new Set([...scrapedAmounts.keys(), ...dbAmounts.keys()]);
  const itemMatches = [...names]
    .map((name) => {
      const scrapedAmount = scrapedAmounts.get(name) ?? null;
      const dbAmount = dbAmounts.get(name) ?? null;
      return {
        name,
        scrapedAmount,
        dbAmount,
        matches:
          scrapedAmount !== null && dbAmount !== null && Math.abs(scrapedAmount - dbAmount) <= 1,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    totalAssetsMatch: Math.abs(scraped.totalAssets - db.totalAssets) <= totalAssetsThreshold,
    itemCountMatch: scraped.items.length === db.items.length,
    itemMatches,
  };
}
