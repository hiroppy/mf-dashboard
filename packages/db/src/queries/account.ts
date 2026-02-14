import { eq, and, sql, inArray } from "drizzle-orm";
import { getDb, type Db, schema } from "../index";
import { resolveGroupId, getAccountIdsForGroup } from "../shared/group-filter";

/**
 * グループの最終スクレイプ日時を取得
 */
export async function getLatestUpdateDate(groupIdParam?: string, db: Db = getDb()) {
  const groupId = await resolveGroupId(db, groupIdParam);
  if (!groupId) return null;

  const group = await db
    .select({ lastScrapedAt: schema.groups.lastScrapedAt })
    .from(schema.groups)
    .where(eq(schema.groups.id, groupId))
    .get();
  return group?.lastScrapedAt ?? null;
}

/**
 * アカウント情報を正規化（nullをデフォルト値に変換）
 */
export function normalizeAccount<
  T extends {
    status: string | null;
    lastUpdated: string | null;
    totalAssets: number | null;
    categoryName: string | null;
    categoryDisplayOrder: number | null;
  },
>(
  account: T,
): Omit<T, "status" | "totalAssets" | "categoryName" | "categoryDisplayOrder"> & {
  status: string;
  lastUpdated: T["lastUpdated"];
  totalAssets: number;
  categoryName: string;
  categoryDisplayOrder: number;
} {
  return {
    ...account,
    status: account.status ?? "ok",
    totalAssets: account.totalAssets ?? 0,
    categoryName: account.categoryName ?? "未分類",
    categoryDisplayOrder: account.categoryDisplayOrder ?? 999,
  };
}

/**
 * グループ内のアクティブアカウントの共通条件を構築
 */
export function buildActiveAccountCondition(accountIds: number[]) {
  return and(
    eq(schema.accounts.isActive, true),
    sql`${schema.accounts.mfId} != 'unknown'`,
    inArray(schema.accounts.id, accountIds),
  );
}

/**
 * グループ内のアカウント一覧（資産情報付き）を取得
 * 資産額は /accounts ページから取得した値を使用（accountStatuses.totalAssets）
 */
export async function getAccountsWithAssets(groupIdParam?: string, db: Db = getDb()) {
  const groupId = await resolveGroupId(db, groupIdParam);
  if (!groupId) return [];

  const accountIds = await getAccountIdsForGroup(db, groupId);
  if (accountIds.length === 0) return [];

  const results = await db
    .select({
      id: schema.accounts.id,
      mfId: schema.accounts.mfId,
      name: schema.accounts.name,
      type: schema.accounts.type,
      status: schema.accountStatuses.status,
      lastUpdated: schema.accountStatuses.lastUpdated,
      totalAssets: schema.accountStatuses.totalAssets,
      categoryId: schema.accounts.categoryId,
      categoryName: schema.institutionCategories.name,
      categoryDisplayOrder: schema.institutionCategories.displayOrder,
    })
    .from(schema.accounts)
    .leftJoin(schema.accountStatuses, eq(schema.accountStatuses.accountId, schema.accounts.id))
    .leftJoin(
      schema.institutionCategories,
      eq(schema.institutionCategories.id, schema.accounts.categoryId),
    )
    .where(buildActiveAccountCondition(accountIds))
    .all();

  return results.map((account) => normalizeAccount(account));
}

/**
 * グループ内のアカウントのmfIdリストを取得（静的生成用）
 */
export async function getAllAccountMfIds(groupIdParam?: string, db: Db = getDb()) {
  const groupId = await resolveGroupId(db, groupIdParam);
  if (!groupId) return [];

  const accountIds = await getAccountIdsForGroup(db, groupId);
  if (accountIds.length === 0) return [];

  const results = await db
    .select({ mfId: schema.accounts.mfId })
    .from(schema.accounts)
    .where(buildActiveAccountCondition(accountIds))
    .all();

  return results.map((a) => a.mfId);
}

/**
 * mfIdでアカウントを取得
 * グループに所属しないアカウントはnullを返す
 */
export async function getAccountByMfId(mfId: string, groupIdParam?: string, db: Db = getDb()) {
  const groupId = await resolveGroupId(db, groupIdParam);
  if (!groupId) return null;

  const accountIds = await getAccountIdsForGroup(db, groupId);
  if (accountIds.length === 0) return null;

  const account = await db
    .select({
      id: schema.accounts.id,
      mfId: schema.accounts.mfId,
      name: schema.accounts.name,
      type: schema.accounts.type,
      status: schema.accountStatuses.status,
      lastUpdated: schema.accountStatuses.lastUpdated,
      totalAssets: schema.accountStatuses.totalAssets,
      errorMessage: schema.accountStatuses.errorMessage,
      categoryName: schema.institutionCategories.name,
    })
    .from(schema.accounts)
    .leftJoin(schema.accountStatuses, eq(schema.accountStatuses.accountId, schema.accounts.id))
    .leftJoin(
      schema.institutionCategories,
      eq(schema.institutionCategories.id, schema.accounts.categoryId),
    )
    .where(and(eq(schema.accounts.mfId, mfId), inArray(schema.accounts.id, accountIds)))
    .get();

  if (!account) return null;

  return {
    id: account.id,
    mfId: account.mfId,
    name: account.name,
    type: account.type,
    status: account.status ?? "ok",
    lastUpdated: account.lastUpdated ?? null,
    totalAssets: account.totalAssets ?? 0,
    errorMessage: account.errorMessage ?? null,
    categoryName: account.categoryName ?? "未分類",
  };
}

type AccountWithCategory = Awaited<ReturnType<typeof getAccountsWithAssets>>[number];

/**
 * アカウントをカテゴリでグループ化
 */
export function groupAccountsByCategory(accounts: AccountWithCategory[]) {
  const grouped = new Map<string, AccountWithCategory[]>();

  for (const account of accounts) {
    const categoryName = account.categoryName;
    if (!grouped.has(categoryName)) {
      grouped.set(categoryName, []);
    }
    grouped.get(categoryName)!.push(account);
  }

  // Sort accounts within each category by totalAssets (descending)
  for (const categoryAccounts of grouped.values()) {
    categoryAccounts.sort((a, b) => b.totalAssets - a.totalAssets);
  }

  // Convert to array and sort categories by displayOrder
  return Array.from(grouped.entries())
    .map(([categoryName, categoryAccounts]) => ({
      categoryName,
      displayOrder: categoryAccounts[0].categoryDisplayOrder,
      accounts: categoryAccounts,
    }))
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * カテゴリ別にグループ化されたアカウント一覧を取得
 */
export async function getAccountsGroupedByCategory(groupIdParam?: string, db: Db = getDb()) {
  const accounts = await getAccountsWithAssets(groupIdParam, db);
  return groupAccountsByCategory(accounts);
}
