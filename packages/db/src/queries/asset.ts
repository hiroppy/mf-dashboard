import {
  addDaysToIsoDateKey,
  formatIsoDateKey,
  getEndOfPreviousMonthIsoDateKey,
  parseIsoDateKey,
} from "@mf-dashboard/date-utils";
import { desc, eq, sql, and } from "drizzle-orm";
import { getDb, type Db, schema } from "../index";
import { resolveGroupId } from "../shared/group-filter";
import { getHoldingsWithLatestValues } from "./holding";

const DEPOSIT_CATEGORY_NAMES = new Set(["預金・現金", "預金・現金・暗号資産"]);

/** Keep category totals within the authoritative asset-history total. */
function reconcileAssetBreakdown(
  categories: Array<{ categoryName: string; amount: number }>,
  totalAssets: number,
) {
  const positiveCategories = categories.filter((category) => category.amount > 0);
  const categoryTotal = positiveCategories.reduce((sum, category) => sum + category.amount, 0);
  const overcount = categoryTotal - totalAssets;

  if (overcount <= 0) {
    return positiveCategories;
  }

  const depositTotal = positiveCategories.reduce(
    (sum, category) =>
      DEPOSIT_CATEGORY_NAMES.has(category.categoryName) ? sum + category.amount : sum,
    0,
  );
  if (depositTotal < overcount) {
    return positiveCategories;
  }

  let remainingOvercount = overcount;
  return positiveCategories
    .map((category) => {
      if (!DEPOSIT_CATEGORY_NAMES.has(category.categoryName) || remainingOvercount === 0) {
        return category;
      }

      const deduction = Math.min(category.amount, remainingOvercount);
      remainingOvercount -= deduction;
      return { ...category, amount: category.amount - deduction };
    })
    .filter((category) => category.amount > 0);
}

/**
 * 日付文字列をパース
 */
export function parseDateString(dateStr: string): { year: number; month: number; day: number } {
  return parseIsoDateKey(dateStr);
}

/**
 * 日付文字列を生成
 */
export function toDateString(year: number, month: number, day: number): string {
  return formatIsoDateKey({ year, month, day });
}

/**
 * 比較対象の日付を計算
 */
export function calculateTargetDate(
  latestDate: string,
  period: "daily" | "weekly" | "monthly",
): string {
  if (period === "monthly") {
    return getEndOfPreviousMonthIsoDateKey(latestDate);
  }

  const daysAgo = period === "daily" ? 1 : 8;
  return addDaysToIsoDateKey(latestDate, -daysAgo);
}

/**
 * カテゴリ別資産内訳を取得
 * assetHistoryCategoriesから最新の値を取得
 */
export async function getAssetBreakdownByCategory(groupIdParam?: string, db: Db = getDb()) {
  const groupId = await resolveGroupId(db, groupIdParam);
  if (!groupId) return [];

  const latestHistory = await db
    .select()
    .from(schema.assetHistory)
    .where(eq(schema.assetHistory.groupId, groupId))
    .orderBy(desc(schema.assetHistory.date))
    .limit(1)
    .get();

  if (!latestHistory) {
    return [];
  }

  const categories = await db
    .select()
    .from(schema.assetHistoryCategories)
    .where(eq(schema.assetHistoryCategories.assetHistoryId, latestHistory.id))
    .all();

  return reconcileAssetBreakdown(categories, latestHistory.totalAssets)
    .map((c) => ({ category: c.categoryName, amount: c.amount }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * 負債を種類別に集計
 */
export function aggregateLiabilitiesByCategory(
  holdings: Array<{
    type: string;
    liabilityCategory: string | null;
    amount: number | null;
  }>,
) {
  const breakdown: Record<string, number> = {};

  for (const holding of holdings) {
    if (holding.type === "liability" && holding.amount) {
      const category = holding.liabilityCategory || "その他";
      breakdown[category] = (breakdown[category] || 0) + holding.amount;
    }
  }

  return Object.entries(breakdown)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * カテゴリ別負債内訳を取得
 */
export async function getLiabilityBreakdownByCategory(groupIdParam?: string, db: Db = getDb()) {
  const holdings = await getHoldingsWithLatestValues(groupIdParam, db);
  return aggregateLiabilitiesByCategory(holdings);
}

/**
 * 資産履歴を取得
 */
export async function getAssetHistory(
  options?: { limit?: number; groupId?: string },
  db: Db = getDb(),
) {
  const groupId = await resolveGroupId(db, options?.groupId);
  if (!groupId) return [];

  const query = db
    .select()
    .from(schema.assetHistory)
    .where(eq(schema.assetHistory.groupId, groupId))
    .orderBy(desc(schema.assetHistory.date));

  if (options?.limit) {
    return await query.limit(options.limit).all();
  }
  return await query.all();
}

/**
 * カテゴリ情報付き資産履歴を取得
 */
export async function getAssetHistoryWithCategories(
  options?: { limit?: number; groupId?: string },
  db: Db = getDb(),
) {
  const groupId = await resolveGroupId(db, options?.groupId);
  if (!groupId) return [];

  const historyEntries = await (async () => {
    const query = db
      .select()
      .from(schema.assetHistory)
      .where(eq(schema.assetHistory.groupId, groupId))
      .orderBy(desc(schema.assetHistory.date));
    return options?.limit ? await query.limit(options.limit).all() : await query.all();
  })();

  const results = [];
  for (const entry of historyEntries) {
    const cats = await db
      .select()
      .from(schema.assetHistoryCategories)
      .where(eq(schema.assetHistoryCategories.assetHistoryId, entry.id))
      .all();

    const categories: Record<string, number> = {};
    for (const cat of cats) {
      categories[cat.categoryName] = cat.amount;
    }

    results.push({
      date: entry.date,
      totalAssets: entry.totalAssets,
      categories,
    });
  }

  return results;
}

/**
 * 最新の総資産を取得
 */
export async function getLatestTotalAssets(
  groupIdParam?: string,
  db: Db = getDb(),
): Promise<number | null> {
  const groupId = await resolveGroupId(db, groupIdParam);
  if (!groupId) return null;

  const latest = await db
    .select({ totalAssets: schema.assetHistory.totalAssets })
    .from(schema.assetHistory)
    .where(eq(schema.assetHistory.groupId, groupId))
    .orderBy(desc(schema.assetHistory.date))
    .limit(1)
    .get();

  return latest?.totalAssets ?? null;
}

/**
 * 日次資産変動を取得（今日vs昨日）
 */
export async function getDailyAssetChange(groupIdParam?: string, db: Db = getDb()) {
  const groupId = await resolveGroupId(db, groupIdParam);
  if (!groupId) return null;

  const latest = await db
    .select()
    .from(schema.assetHistory)
    .where(eq(schema.assetHistory.groupId, groupId))
    .orderBy(desc(schema.assetHistory.date))
    .limit(2)
    .all();

  if (latest.length < 2) {
    return null;
  }

  return {
    today: latest[0].totalAssets,
    yesterday: latest[1].totalAssets,
    change: latest[0].totalAssets - latest[1].totalAssets,
  };
}

/**
 * カテゴリ変動を計算
 */
export function calculateCategoryChanges(
  latestCategories: Array<{ categoryName: string; amount: number }>,
  previousCategories: Array<{ categoryName: string; amount: number }>,
) {
  const latestMap = new Map(latestCategories.map((c) => [c.categoryName, c.amount]));
  const previousMap = new Map(previousCategories.map((c) => [c.categoryName, c.amount]));

  const allCategoryNames = new Set([...latestMap.keys(), ...previousMap.keys()]);

  return [...allCategoryNames]
    .map((name) => ({
      name,
      current: latestMap.get(name) ?? 0,
      previous: previousMap.get(name) ?? 0,
      change: (latestMap.get(name) ?? 0) - (previousMap.get(name) ?? 0),
    }))
    .filter((cat) => cat.current > 0 || cat.previous > 0);
}

/**
 * 期間別カテゴリ変動を取得
 */
export async function getCategoryChangesForPeriod(
  period: "daily" | "weekly" | "monthly",
  groupIdParam?: string,
  db: Db = getDb(),
) {
  const groupId = await resolveGroupId(db, groupIdParam);
  if (!groupId) return null;

  const latest = await db
    .select()
    .from(schema.assetHistory)
    .where(eq(schema.assetHistory.groupId, groupId))
    .orderBy(desc(schema.assetHistory.date))
    .limit(1)
    .get();

  if (!latest) {
    return null;
  }

  const targetDateStr = calculateTargetDate(latest.date, period);

  const previous = await db
    .select()
    .from(schema.assetHistory)
    .where(
      and(
        eq(schema.assetHistory.groupId, groupId),
        sql`${schema.assetHistory.date} <= ${targetDateStr}`,
      ),
    )
    .orderBy(desc(schema.assetHistory.date))
    .limit(1)
    .get();

  if (!previous || previous.date === latest.date) {
    return null;
  }

  const latestCategories = await db
    .select()
    .from(schema.assetHistoryCategories)
    .where(eq(schema.assetHistoryCategories.assetHistoryId, latest.id))
    .all();

  const previousCategories = await db
    .select()
    .from(schema.assetHistoryCategories)
    .where(eq(schema.assetHistoryCategories.assetHistoryId, previous.id))
    .all();

  const categoryChanges = calculateCategoryChanges(latestCategories, previousCategories);

  return {
    categories: categoryChanges,
    total: {
      current: latest.totalAssets,
      previous: previous.totalAssets,
      change: latest.totalAssets - previous.totalAssets,
    },
  };
}
