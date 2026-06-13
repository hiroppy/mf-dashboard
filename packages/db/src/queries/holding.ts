import { desc, eq, and, isNotNull, inArray } from "drizzle-orm";
import { getDb, type Db, schema } from "../index";
import { resolveGroupId, getAccountIdsForGroup } from "../shared/group-filter";

const INVESTMENT_CATEGORIES = ["株式(現物)", "投資信託"];

/**
 * 最新のスナップショットを取得
 * スナップショットは全アカウント共通で1つ作成される
 */
export async function getLatestSnapshot(db: Db = getDb()) {
  return await db
    .select()
    .from(schema.dailySnapshots)
    .orderBy(desc(schema.dailySnapshots.id))
    .limit(1)
    .get();
}

/**
 * 保有資産を取得する共通のwhere条件を構築
 */
export function buildHoldingWhereCondition(
  snapshotId: number,
  accountIds: number[],
  additionalCondition?: ReturnType<typeof eq>,
) {
  const baseCondition = eq(schema.holdingValues.snapshotId, snapshotId);

  if (accountIds.length > 0) {
    const conditions = [baseCondition, inArray(schema.holdings.accountId, accountIds)];
    if (additionalCondition) {
      conditions.push(additionalCondition);
    }
    return and(...conditions);
  }

  if (additionalCondition) {
    return and(baseCondition, additionalCondition);
  }

  return baseCondition;
}

/**
 * 保有資産の最新値を取得
 * snapshotIdで駆動し、グループでフィルタリング
 */
export async function getHoldingsWithLatestValues(groupIdParam?: string, db: Db = getDb()) {
  const latestSnapshot = await getLatestSnapshot(db);

  if (!latestSnapshot) {
    return [];
  }

  const groupId = await resolveGroupId(db, groupIdParam);
  const accountIds = groupId ? await getAccountIdsForGroup(db, groupId) : [];

  const whereCondition = buildHoldingWhereCondition(latestSnapshot.id, accountIds);

  return await db
    .select({
      id: schema.holdings.id,
      name: schema.holdings.name,
      type: schema.holdings.type,
      liabilityCategory: schema.holdings.liabilityCategory,
      categoryId: schema.holdings.categoryId,
      categoryName: schema.assetCategories.name,
      accountId: schema.holdings.accountId,
      accountName: schema.accounts.name,
      institution: schema.accounts.institution,
      amount: schema.holdingValues.amount,
      quantity: schema.holdingValues.quantity,
      unitPrice: schema.holdingValues.unitPrice,
      avgCostPrice: schema.holdingValues.avgCostPrice,
      dailyChange: schema.holdingValues.dailyChange,
      unrealizedGain: schema.holdingValues.unrealizedGain,
      unrealizedGainPct: schema.holdingValues.unrealizedGainPct,
    })
    .from(schema.holdingValues)
    .innerJoin(schema.holdings, eq(schema.holdings.id, schema.holdingValues.holdingId))
    .leftJoin(schema.assetCategories, eq(schema.assetCategories.id, schema.holdings.categoryId))
    .leftJoin(schema.accounts, eq(schema.accounts.id, schema.holdings.accountId))
    .where(whereCondition)
    .all();
}

/**
 * 特定アカウントの保有資産を取得
 * アカウントがグループに所属しない場合は空配列を返す
 */
export async function getHoldingsByAccountId(
  accountId: number,
  groupIdParam?: string,
  db: Db = getDb(),
) {
  const groupId = await resolveGroupId(db, groupIdParam);
  if (!groupId) return [];

  const accountIds = await getAccountIdsForGroup(db, groupId);
  if (accountIds.length === 0 || !accountIds.includes(accountId)) return [];

  const latestSnapshot = await getLatestSnapshot(db);

  if (!latestSnapshot) {
    return [];
  }

  return await db
    .select({
      id: schema.holdings.id,
      name: schema.holdings.name,
      type: schema.holdings.type,
      liabilityCategory: schema.holdings.liabilityCategory,
      categoryName: schema.assetCategories.name,
      accountName: schema.accounts.name,
      institution: schema.accounts.institution,
      amount: schema.holdingValues.amount,
      quantity: schema.holdingValues.quantity,
      unitPrice: schema.holdingValues.unitPrice,
      avgCostPrice: schema.holdingValues.avgCostPrice,
      dailyChange: schema.holdingValues.dailyChange,
      unrealizedGain: schema.holdingValues.unrealizedGain,
      unrealizedGainPct: schema.holdingValues.unrealizedGainPct,
    })
    .from(schema.holdingValues)
    .innerJoin(schema.holdings, eq(schema.holdings.id, schema.holdingValues.holdingId))
    .leftJoin(schema.assetCategories, eq(schema.assetCategories.id, schema.holdings.categoryId))
    .leftJoin(schema.accounts, eq(schema.accounts.id, schema.holdings.accountId))
    .where(
      and(
        eq(schema.holdingValues.snapshotId, latestSnapshot.id),
        eq(schema.holdings.accountId, accountId),
      ),
    )
    .all();
}

export interface HoldingWithDailyChange {
  id: number;
  name: string;
  code: string | null;
  categoryName: string | null;
  accountName: string | null;
  dailyChange: number;
}

/**
 * 日次変動がある保有資産を取得
 * daily_changeがnullでないもののみ返す
 */
export async function getHoldingsWithDailyChange(
  groupIdParam?: string,
  db: Db = getDb(),
): Promise<HoldingWithDailyChange[]> {
  const latestSnapshot = await getLatestSnapshot(db);

  if (!latestSnapshot) {
    return [];
  }

  const groupId = await resolveGroupId(db, groupIdParam);
  const accountIds = groupId ? await getAccountIdsForGroup(db, groupId) : [];

  const whereCondition = buildHoldingWhereCondition(
    latestSnapshot.id,
    accountIds,
    isNotNull(schema.holdingValues.dailyChange),
  );

  return (await db
    .select({
      id: schema.holdings.id,
      name: schema.holdings.name,
      code: schema.holdings.code,
      categoryName: schema.assetCategories.name,
      accountName: schema.accounts.name,
      dailyChange: schema.holdingValues.dailyChange,
    })
    .from(schema.holdingValues)
    .innerJoin(schema.holdings, eq(schema.holdings.id, schema.holdingValues.holdingId))
    .leftJoin(schema.assetCategories, eq(schema.assetCategories.id, schema.holdings.categoryId))
    .leftJoin(schema.accounts, eq(schema.accounts.id, schema.holdings.accountId))
    .where(whereCondition)
    .all()) as HoldingWithDailyChange[];
}

/**
 * 投資銘柄を保有しているかチェック
 */
export async function hasInvestmentHoldings(groupIdParam?: string, db: Db = getDb()) {
  const holdings = await getHoldingsWithLatestValues(groupIdParam, db);
  return holdings.some(
    (h) => h.categoryName !== null && INVESTMENT_CATEGORIES.includes(h.categoryName),
  );
}
