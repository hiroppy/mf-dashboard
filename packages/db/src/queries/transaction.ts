import { and, desc, eq, gte, inArray, like, lte, sql, type SQL } from "drizzle-orm";
import { getDb, type Db, schema } from "../index";
import { resolveGroupId, getAccountIdsForGroup } from "../shared/group-filter";
import { transformTransferToIncome } from "../shared/transfer";

export interface SearchTransactionsOptions {
  groupId: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  month?: string;
  category?: string;
  subCategory?: string;
  keyword?: string;
  minAmount?: number;
  maxAmount?: number;
  type?: "income" | "expense" | "transfer";
  includeTransfers?: boolean;
  includeExcluded?: boolean;
}

export async function searchTransactions(options: SearchTransactionsOptions, db: Db = getDb()) {
  const accountIds = await getAccountIdsForGroup(db, options.groupId);
  if (accountIds.length === 0) return [];

  const conditions: SQL[] = [inArray(schema.transactions.accountId, accountIds)];

  if (options.date) conditions.push(eq(schema.transactions.date, options.date));
  if (options.startDate) conditions.push(gte(schema.transactions.date, options.startDate));
  if (options.endDate) conditions.push(lte(schema.transactions.date, options.endDate));
  if (options.month) conditions.push(like(schema.transactions.date, `${options.month}-%`));
  if (options.minAmount !== undefined) {
    conditions.push(gte(schema.transactions.amount, options.minAmount));
  }
  if (options.maxAmount !== undefined) {
    conditions.push(lte(schema.transactions.amount, options.maxAmount));
  }

  const results = await db
    .select({
      id: schema.transactions.id,
      mfId: schema.transactions.mfId,
      date: schema.transactions.date,
      category: schema.transactions.category,
      subCategory: schema.transactions.subCategory,
      description: schema.transactions.description,
      amount: schema.transactions.amount,
      type: schema.transactions.type,
      isTransfer: schema.transactions.isTransfer,
      isExcludedFromCalculation: schema.transactions.isExcludedFromCalculation,
      accountId: schema.transactions.accountId,
      accountName: schema.accounts.name,
      transferTarget: schema.transactions.transferTarget,
      transferTargetAccountId: schema.transactions.transferTargetAccountId,
    })
    .from(schema.transactions)
    .leftJoin(schema.accounts, eq(schema.accounts.id, schema.transactions.accountId))
    .where(and(...conditions))
    .orderBy(desc(schema.transactions.date), desc(schema.transactions.id))
    .all();

  const keyword = options.keyword?.toLocaleLowerCase();

  return results
    .map((transaction) => transformTransferToIncome(transaction, accountIds))
    .filter((transaction) => {
      if (options.category && transaction.category !== options.category) return false;
      if (options.subCategory && transaction.subCategory !== options.subCategory) return false;
      if (options.type && transaction.type !== options.type) return false;
      if (options.includeTransfers === false && transaction.isTransfer) return false;
      if (options.includeExcluded === false && transaction.isExcludedFromCalculation) return false;

      if (keyword) {
        return [transaction.description, transaction.category, transaction.subCategory].some(
          (value) => value?.toLocaleLowerCase().includes(keyword),
        );
      }

      return true;
    });
}

export async function getTransactions(
  options?: { limit?: number; groupId?: string },
  db: Db = getDb(),
) {
  const groupId = await resolveGroupId(db, options?.groupId);
  if (!groupId) return [];

  const accountIds = await getAccountIdsForGroup(db, groupId);
  if (accountIds.length === 0) return [];

  let query = db
    .select({
      id: schema.transactions.id,
      mfId: schema.transactions.mfId,
      date: schema.transactions.date,
      category: schema.transactions.category,
      subCategory: schema.transactions.subCategory,
      description: schema.transactions.description,
      amount: schema.transactions.amount,
      type: schema.transactions.type,
      isTransfer: schema.transactions.isTransfer,
      isExcludedFromCalculation: schema.transactions.isExcludedFromCalculation,
      accountId: schema.transactions.accountId,
      accountName: schema.accounts.name,
      transferTargetAccountId: schema.transactions.transferTargetAccountId,
    })
    .from(schema.transactions)
    .leftJoin(schema.accounts, eq(schema.accounts.id, schema.transactions.accountId))
    .where(inArray(schema.transactions.accountId, accountIds))
    .orderBy(desc(schema.transactions.date));

  if (options?.limit) {
    const results = await query.limit(options.limit).all();
    return results.map((t) => transformTransferToIncome(t, accountIds));
  }
  const results = await query.all();
  return results.map((t) => transformTransferToIncome(t, accountIds));
}

export async function getTransactionsByMonth(
  month: string,
  groupIdParam?: string,
  db: Db = getDb(),
) {
  const groupId = await resolveGroupId(db, groupIdParam);
  if (!groupId) return [];

  const startDate = `${month}-01`;
  const endDate = `${month}-31`;

  const accountIds = await getAccountIdsForGroup(db, groupId);
  if (accountIds.length === 0) return [];

  const results = await db
    .select({
      id: schema.transactions.id,
      mfId: schema.transactions.mfId,
      date: schema.transactions.date,
      category: schema.transactions.category,
      subCategory: schema.transactions.subCategory,
      description: schema.transactions.description,
      amount: schema.transactions.amount,
      type: schema.transactions.type,
      isTransfer: schema.transactions.isTransfer,
      isExcludedFromCalculation: schema.transactions.isExcludedFromCalculation,
      accountId: schema.transactions.accountId,
      accountName: schema.accounts.name,
      transferTargetAccountId: schema.transactions.transferTargetAccountId,
    })
    .from(schema.transactions)
    .leftJoin(schema.accounts, eq(schema.accounts.id, schema.transactions.accountId))
    .where(
      and(
        gte(schema.transactions.date, startDate),
        sql`${schema.transactions.date} <= ${endDate}`,
        inArray(schema.transactions.accountId, accountIds),
      ),
    )
    .orderBy(desc(schema.transactions.date))
    .all();

  return results.map((t) => transformTransferToIncome(t, accountIds));
}

export async function getTransactionsByAccountId(
  accountId: number,
  groupIdParam?: string,
  db: Db = getDb(),
) {
  const groupId = await resolveGroupId(db, groupIdParam);
  if (!groupId) return [];

  const accountIds = await getAccountIdsForGroup(db, groupId);
  if (accountIds.length === 0 || !accountIds.includes(accountId)) return [];

  return await db
    .select({
      id: schema.transactions.id,
      mfId: schema.transactions.mfId,
      date: schema.transactions.date,
      category: schema.transactions.category,
      subCategory: schema.transactions.subCategory,
      description: schema.transactions.description,
      amount: schema.transactions.amount,
      type: schema.transactions.type,
      isTransfer: schema.transactions.isTransfer,
      isExcludedFromCalculation: schema.transactions.isExcludedFromCalculation,
      accountId: schema.transactions.accountId,
      accountName: schema.accounts.name,
    })
    .from(schema.transactions)
    .leftJoin(schema.accounts, eq(schema.accounts.id, schema.transactions.accountId))
    .where(eq(schema.transactions.accountId, accountId))
    .orderBy(desc(schema.transactions.date))
    .all();
}
