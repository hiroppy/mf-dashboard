import { desc, eq, and, gte, sql, inArray } from "drizzle-orm";
import { getDb, type Db, schema } from "../index";
import { resolveGroupId, getAccountIdsForGroup } from "../shared/group-filter";
import { transformTransferToIncome } from "../shared/transfer";

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
