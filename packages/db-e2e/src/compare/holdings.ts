import type { Portfolio } from "@mf-dashboard/db/types";
import { getHoldingsWithLatestValues, type Db } from "@mf-dashboard/db";

export type HoldingComparison = {
  groupId: string;
  groupName: string;
  scraped: {
    totalAssets: number;
    itemCount: number;
    items: Array<{ name: string; balance: number; type: string }>;
  };
  db: {
    totalAssets: number;
    itemCount: number;
    items: Array<{ name: string; amount: number; type: string | null }>;
  };
  matches: {
    totalAssets: boolean;
    itemCount: boolean;
    // 個別銘柄の一致状況
    itemMatches: Array<{
      name: string;
      scrapedBalance: number | null;
      dbAmount: number | null;
      matches: boolean;
    }>;
  };
  totalAssetsThreshold: number; // 許容誤差
};

/**
 * DBから保有資産の集計を取得
 */
async function getDbHoldingSummary(
  groupId: string,
  db: Db,
): Promise<{
  totalAssets: number;
  itemCount: number;
  items: Array<{ name: string; amount: number; type: string | null }>;
}> {
  const holdings = await getHoldingsWithLatestValues(groupId, db);

  // 負債（liabilityCategory が設定されているもの）を除外して資産のみ集計
  const assetHoldings = holdings.filter((h) => !h.liabilityCategory);

  const totalAssets = assetHoldings.reduce((sum, h) => sum + (h.amount || 0), 0);

  return {
    totalAssets,
    itemCount: assetHoldings.length,
    items: assetHoldings.map((h) => ({
      name: h.name,
      amount: h.amount || 0,
      type: h.type,
    })),
  };
}

/**
 * スクレイピング結果から保有資産の集計を取得
 */
function getScrapedHoldingSummary(portfolio: Portfolio): {
  totalAssets: number;
  itemCount: number;
  items: Array<{ name: string; balance: number; type: string }>;
} {
  return {
    totalAssets: portfolio.totalAssets,
    itemCount: portfolio.items.length,
    items: portfolio.items.map((item) => ({
      name: item.name,
      balance: item.balance || 0,
      type: item.type,
    })),
  };
}

/**
 * 名前でマッチングして個別銘柄を比較
 */
function compareItems(
  scrapedItems: Array<{ name: string; balance: number; type: string }>,
  dbItems: Array<{ name: string; amount: number; type: string | null }>,
): Array<{
  name: string;
  scrapedBalance: number | null;
  dbAmount: number | null;
  matches: boolean;
}> {
  const results: Array<{
    name: string;
    scrapedBalance: number | null;
    dbAmount: number | null;
    matches: boolean;
  }> = [];

  // スクレイピング結果をMapに変換
  const scrapedMap = new Map<string, number>();
  for (const item of scrapedItems) {
    // 同名の銘柄がある場合は合算（複数口座で同じ銘柄を持つ場合）
    scrapedMap.set(item.name, (scrapedMap.get(item.name) || 0) + item.balance);
  }

  // DB結果をMapに変換
  const dbMap = new Map<string, number>();
  for (const item of dbItems) {
    dbMap.set(item.name, (dbMap.get(item.name) || 0) + item.amount);
  }

  // 全ての銘柄名を収集
  const allNames = new Set([...scrapedMap.keys(), ...dbMap.keys()]);

  for (const name of allNames) {
    const scrapedBalance = scrapedMap.get(name) ?? null;
    const dbAmount = dbMap.get(name) ?? null;

    // 両方存在する場合は金額を比較、片方のみの場合は不一致
    let matches = false;
    if (scrapedBalance !== null && dbAmount !== null) {
      // 1円以下の誤差は許容
      matches = Math.abs(scrapedBalance - dbAmount) <= 1;
    }

    results.push({
      name,
      scrapedBalance,
      dbAmount,
      matches,
    });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * スクレイピング結果とDBの保有資産を比較
 */
export async function compareHoldings(
  groupId: string,
  groupName: string,
  scraped: Portfolio,
  db: Db,
  totalAssetsThreshold = 100, // デフォルト100円の誤差を許容
): Promise<HoldingComparison> {
  const scrapedSummary = getScrapedHoldingSummary(scraped);
  const dbSummary = await getDbHoldingSummary(groupId, db);

  const itemMatches = compareItems(scrapedSummary.items, dbSummary.items);

  // 総資産は閾値内の誤差を許容
  const totalAssetsDiff = Math.abs(scrapedSummary.totalAssets - dbSummary.totalAssets);
  const totalAssetsMatch = totalAssetsDiff <= totalAssetsThreshold;

  return {
    groupId,
    groupName,
    scraped: scrapedSummary,
    db: dbSummary,
    matches: {
      totalAssets: totalAssetsMatch,
      itemCount: scrapedSummary.itemCount === dbSummary.itemCount,
      itemMatches,
    },
    totalAssetsThreshold,
  };
}

/**
 * 比較結果を安全に出力（金額は表示しない）
 */
export function formatHoldingComparisonResult(comparison: HoldingComparison): string {
  const lines: string[] = [];
  const prefix = comparison.groupName;

  // 総資産の比較
  const assetDiff = comparison.scraped.totalAssets - comparison.db.totalAssets;
  lines.push(
    `${comparison.matches.totalAssets ? "✓" : "✗"} ${prefix} 総資産: ${comparison.matches.totalAssets ? "一致" : `不一致 (差額: ${assetDiff.toLocaleString()}円)`}`,
  );

  // 件数の比較
  lines.push(
    `${comparison.matches.itemCount ? "✓" : "✗"} ${prefix} 銘柄数: ${comparison.matches.itemCount ? "一致" : `不一致 (スクレイピング: ${comparison.scraped.itemCount}, DB: ${comparison.db.itemCount})`}`,
  );

  // 不一致の銘柄を表示
  const mismatches = comparison.matches.itemMatches.filter((m) => !m.matches);
  if (mismatches.length > 0) {
    lines.push(`  不一致銘柄 (${mismatches.length}件):`);
    for (const m of mismatches.slice(0, 10)) {
      // 最大10件表示
      const scrapedStr =
        m.scrapedBalance !== null ? `${m.scrapedBalance.toLocaleString()}円` : "なし";
      const dbStr = m.dbAmount !== null ? `${m.dbAmount.toLocaleString()}円` : "なし";
      lines.push(`    - ${m.name}: スクレイピング=${scrapedStr}, DB=${dbStr}`);
    }
    if (mismatches.length > 10) {
      lines.push(`    ... 他${mismatches.length - 10}件`);
    }
  }

  return lines.join("\n");
}
