import { and, desc, eq, gte, inArray, like, lte, or, sql, type SQL } from "drizzle-orm";
import { getDb, type Db, schema } from "../index";
import { resolveGroupId, getAccountIdsForGroup } from "../shared/group-filter";
import { transformTransferToIncome } from "../shared/transfer";

export const SEARCH_TRANSACTIONS_DEFAULT_LIMIT = 50;
export const SEARCH_TRANSACTIONS_MAX_LIMIT = 100;
export const SEARCH_TRANSACTIONS_MAX_OFFSET = 900;
export const SEARCH_TRANSACTIONS_MAX_SCANNED_ROWS = 1_000;

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
  limit?: number;
  offset?: number;
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const integer = value === undefined || !Number.isFinite(value) ? fallback : Math.trunc(value);
  return Math.min(Math.max(integer, minimum), maximum);
}

export async function searchTransactions(options: SearchTransactionsOptions, db: Db = getDb()) {
  const accountIds = await getAccountIdsForGroup(db, options.groupId);
  if (accountIds.length === 0) return [];

  const conditions: SQL[] = [
    or(
      inArray(schema.transactions.accountId, accountIds),
      and(
        eq(schema.transactions.type, "transfer"),
        inArray(schema.transactions.transferTargetAccountId, accountIds),
      ),
    )!,
  ];

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

  const limit = boundedInteger(
    options.limit,
    SEARCH_TRANSACTIONS_DEFAULT_LIMIT,
    1,
    SEARCH_TRANSACTIONS_MAX_LIMIT,
  );
  const offset = boundedInteger(options.offset, 0, 0, SEARCH_TRANSACTIONS_MAX_OFFSET);
  const fetchBatch = (batchOffset: number) =>
    db
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
      .limit(SEARCH_TRANSACTIONS_MAX_LIMIT)
      .offset(batchOffset)
      .all();

  const keyword = options.keyword?.toLocaleLowerCase();
  const accountIdSet = new Set(accountIds);
  type SearchTransaction = Awaited<ReturnType<typeof fetchBatch>>[number];
  type TransferTransaction = SearchTransaction & {
    accountId: number;
    transferTargetAccountId: number;
  };
  type NormalTransactionType = "income" | "expense";
  interface TransferLookups {
    accountNamesById: Map<number, string>;
    groupsByAccountId: Map<number, Set<string>>;
    normalTransactionCounts: Map<string, number>;
  }
  let nextBoundaryTransactionId = -1;
  const consumedNormalTransactionCounts = new Map<string, number>();

  const projectBoundaryTransfer = (
    transaction: SearchTransaction,
    groupAccountId: number,
    lookups: TransferLookups,
  ): SearchTransaction => {
    const id = nextBoundaryTransactionId--;
    return {
      ...transaction,
      id,
      mfId: `boundary-transfer-${Math.abs(id)}`,
      description: "口座間振替",
      accountId: groupAccountId,
      accountName: lookups.accountNamesById.get(groupAccountId) ?? null,
      transferTarget: null,
      transferTargetAccountId: null,
    };
  };

  const normalTransactionKey = (
    accountId: number,
    date: string,
    amount: number,
    type: NormalTransactionType,
  ) => `${accountId}\0${date}\0${amount}\0${type}`;

  const consumeNormalTransaction = (key: string, lookups: TransferLookups) => {
    const available = lookups.normalTransactionCounts.get(key) ?? 0;
    const consumed = consumedNormalTransactionCounts.get(key) ?? 0;
    if (consumed >= available) return false;

    consumedNormalTransactionCounts.set(key, consumed + 1);
    return true;
  };

  const loadTransferLookups = async (batch: SearchTransaction[]) => {
    const transfers = batch.filter(
      (transaction): transaction is TransferTransaction =>
        transaction.type === "transfer" &&
        transaction.accountId !== null &&
        transaction.transferTargetAccountId !== null,
    );
    const transferAccountIds = [
      ...new Set(
        transfers.flatMap((transaction) => [
          transaction.accountId,
          transaction.transferTargetAccountId,
        ]),
      ),
    ];
    const accountNamesById = new Map<number, string>();
    const groupsByAccountId = new Map<number, Set<string>>();
    const normalTransactionCounts = new Map<string, number>();

    if (transferAccountIds.length === 0) {
      return { accountNamesById, groupsByAccountId, normalTransactionCounts };
    }

    const dates = [...new Set(transfers.map((transaction) => transaction.date))];
    const amounts = [...new Set(transfers.map((transaction) => transaction.amount))];
    const [groupAccounts, transferAccounts, normalTransactions] = await Promise.all([
      db
        .select({
          accountId: schema.groupAccounts.accountId,
          groupId: schema.groupAccounts.groupId,
        })
        .from(schema.groupAccounts)
        .where(inArray(schema.groupAccounts.accountId, transferAccountIds))
        .all(),
      db
        .select({ id: schema.accounts.id, name: schema.accounts.name })
        .from(schema.accounts)
        .where(inArray(schema.accounts.id, transferAccountIds))
        .all(),
      db
        .select({
          accountId: schema.transactions.accountId,
          date: schema.transactions.date,
          amount: schema.transactions.amount,
          type: schema.transactions.type,
          isExcludedFromCalculation: schema.transactions.isExcludedFromCalculation,
        })
        .from(schema.transactions)
        .where(
          and(
            inArray(schema.transactions.accountId, transferAccountIds),
            inArray(schema.transactions.date, dates),
            inArray(schema.transactions.amount, amounts),
            sql`${schema.transactions.type} IN ('income', 'expense')`,
          ),
        )
        .all(),
    ]);

    for (const account of transferAccounts) {
      accountNamesById.set(account.id, account.name);
    }

    for (const { accountId, groupId } of groupAccounts) {
      if (groupId === "0") continue;
      const groups = groupsByAccountId.get(accountId) ?? new Set<string>();
      groups.add(groupId);
      groupsByAccountId.set(accountId, groups);
    }

    for (const transaction of normalTransactions) {
      if (
        transaction.accountId === null ||
        (transaction.type !== "income" && transaction.type !== "expense") ||
        (options.includeExcluded === false && transaction.isExcludedFromCalculation)
      ) {
        continue;
      }
      const key = normalTransactionKey(
        transaction.accountId,
        transaction.date,
        transaction.amount,
        transaction.type,
      );
      normalTransactionCounts.set(key, (normalTransactionCounts.get(key) ?? 0) + 1);
    }

    return { accountNamesById, groupsByAccountId, normalTransactionCounts };
  };

  const transformTransaction = (
    transaction: SearchTransaction,
    lookups: TransferLookups,
  ): SearchTransaction | null => {
    if (
      transaction.type !== "transfer" ||
      transaction.accountId === null ||
      transaction.transferTargetAccountId === null
    ) {
      return transaction;
    }

    const sourceInGroup = accountIdSet.has(transaction.accountId);
    const targetInGroup = accountIdSet.has(transaction.transferTargetAccountId);
    const sourceGroups = lookups.groupsByAccountId.get(transaction.accountId);
    const targetGroups = lookups.groupsByAccountId.get(transaction.transferTargetAccountId);
    const hasCommonGroup =
      sourceGroups !== undefined &&
      targetGroups !== undefined &&
      [...sourceGroups].some((groupId) => targetGroups.has(groupId));
    let classification: "income" | "expense" | null = null;

    if (!hasCommonGroup && sourceInGroup && !targetInGroup) {
      classification = "income";
    } else if (!hasCommonGroup && !sourceInGroup && targetInGroup) {
      classification = "expense";
    }

    if (classification === "expense") {
      if (
        consumeNormalTransaction(
          normalTransactionKey(
            transaction.transferTargetAccountId,
            transaction.date,
            transaction.amount,
            "expense",
          ),
          lookups,
        )
      ) {
        return null;
      }
      return {
        ...projectBoundaryTransfer(transaction, transaction.transferTargetAccountId, lookups),
        type: "expense",
        category: "支出",
        subCategory: "振替出金",
        isTransfer: false,
        isExcludedFromCalculation: false,
      };
    }

    if (classification === "income") {
      if (
        consumeNormalTransaction(
          normalTransactionKey(
            transaction.accountId,
            transaction.date,
            transaction.amount,
            "income",
          ),
          lookups,
        )
      ) {
        return null;
      }
      return {
        ...projectBoundaryTransfer(transaction, transaction.accountId, lookups),
        type: "income",
        category: "収入",
        subCategory: "振替入金",
        isTransfer: false,
        isExcludedFromCalculation: false,
      };
    }

    if (sourceInGroup !== targetInGroup) {
      const groupAccountId = sourceInGroup
        ? transaction.accountId
        : transaction.transferTargetAccountId;
      return projectBoundaryTransfer(transaction, groupAccountId, lookups);
    }

    return transaction;
  };

  const matchesOptions = (transaction: SearchTransaction) => {
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
  };

  const page: SearchTransaction[] = [];
  let batchOffset = 0;
  let remainingOffset = offset;

  while (page.length < limit && batchOffset < SEARCH_TRANSACTIONS_MAX_SCANNED_ROWS) {
    const batch = await fetchBatch(batchOffset);
    const transferLookups = await loadTransferLookups(batch);

    for (const rawTransaction of batch) {
      const transaction = transformTransaction(rawTransaction, transferLookups);
      if (!transaction) continue;
      if (!matchesOptions(transaction)) continue;
      if (remainingOffset > 0) {
        remainingOffset -= 1;
        continue;
      }
      page.push(transaction);
      if (page.length === limit) break;
    }

    if (batch.length < SEARCH_TRANSACTIONS_MAX_LIMIT) break;
    batchOffset += batch.length;
  }

  return page;
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
