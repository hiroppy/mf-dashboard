import type { CashFlowSummary } from "@mf-dashboard/db/types";
import { getTransactionsByMonth, getMonthlySummaryByMonth, type Db } from "@mf-dashboard/db";

export type TransactionComparison = {
  month: string;
  groupId: string;
  groupName: string;
  scraped: {
    count: number;
    totalIncome: number;
    totalExpense: number;
  };
  db: {
    count: number;
    totalIncome: number;
    totalExpense: number;
  };
  matches: {
    count: boolean;
    totalIncome: boolean;
    totalExpense: boolean;
  };
};

/**
 * DBから月別のtransaction集計を取得
 * getMonthlySummaryByMonthを使用してWebアプリと同じロジックで計算
 */
async function getDbTransactionSummary(
  month: string,
  groupId: string,
  db: Db,
): Promise<{ count: number; totalIncome: number; totalExpense: number }> {
  // 収入・支出はWebアプリと同じロジック（getMonthlySummaryByMonth）を使用
  const summary = await getMonthlySummaryByMonth(month, groupId, db);
  const totalIncome = summary?.totalIncome || 0;
  const totalExpense = summary?.totalExpense || 0;

  // 件数はトランザクションから計算（振替・計算対象外を除く）
  const transactions = await getTransactionsByMonth(month, groupId, db);
  let count = 0;
  for (const t of transactions) {
    if (t.isExcludedFromCalculation) continue;
    if (t.isTransfer) continue;
    count++;
  }

  return { count, totalIncome, totalExpense };
}

/**
 * スクレイピング結果から月別のtransaction集計を取得
 */
function getScrapedTransactionSummary(cashFlow: CashFlowSummary): {
  count: number;
  totalIncome: number;
  totalExpense: number;
} {
  // スクレイピング結果のtotalIncome/totalExpenseはサイト上の集計値
  // itemsから計算し直すのではなく、サイトの値をそのまま使う
  let count = 0;

  for (const item of cashFlow.items) {
    if (item.isExcludedFromCalculation) continue;
    if (item.isTransfer) continue;
    count++;
  }

  return {
    count,
    totalIncome: cashFlow.totalIncome,
    totalExpense: cashFlow.totalExpense,
  };
}

/**
 * スクレイピング結果とDBの値を比較
 */
export async function compareTransactions(
  month: string,
  groupId: string,
  groupName: string,
  scraped: CashFlowSummary,
  db: Db,
): Promise<TransactionComparison> {
  const scrapedSummary = getScrapedTransactionSummary(scraped);
  const dbSummary = await getDbTransactionSummary(month, groupId, db);

  return {
    month,
    groupId,
    groupName,
    scraped: scrapedSummary,
    db: dbSummary,
    matches: {
      count: scrapedSummary.count === dbSummary.count,
      totalIncome: scrapedSummary.totalIncome === dbSummary.totalIncome,
      totalExpense: scrapedSummary.totalExpense === dbSummary.totalExpense,
    },
  };
}

/**
 * 比較結果を安全に出力（金額は表示しない）
 */
export function formatComparisonResult(comparison: TransactionComparison): string {
  const lines: string[] = [];
  const prefix = `${comparison.groupName} - ${comparison.month}`;

  lines.push(
    `${comparison.matches.count ? "✓" : "✗"} ${prefix} transaction件数: ${comparison.matches.count ? "一致" : "不一致"}`,
  );
  lines.push(
    `${comparison.matches.totalIncome ? "✓" : "✗"} ${prefix} 収入合計: ${comparison.matches.totalIncome ? "一致" : "不一致"}`,
  );
  lines.push(
    `${comparison.matches.totalExpense ? "✓" : "✗"} ${prefix} 支出合計: ${comparison.matches.totalExpense ? "一致" : "不一致"}`,
  );

  return lines.join("\n");
}
