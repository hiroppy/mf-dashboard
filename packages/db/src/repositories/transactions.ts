import { and, eq, gte, inArray, like, lt, sql } from "drizzle-orm";
import type { Db, DbExecutor } from "../index";
import { schema } from "../index";
import type { CashFlowItem } from "../types";
import { convertToIsoDate, now, upsertById } from "../utils";

const BATCH_SIZE = 500;

export interface TransactionDateRange {
  from: string;
  to: string;
}

export async function saveTransaction(
  db: DbExecutor,
  item: CashFlowItem,
  accountIdMap?: Map<string, number>,
): Promise<void> {
  // Skip items without valid mfId
  if (!item.mfId || item.mfId.startsWith("unknown")) {
    return;
  }

  // 日付をISO形式に変換
  const isoDate = convertToIsoDate(item.date);

  // accountName から account_id をルックアップ
  let accountId: number | null = null;
  if (accountIdMap && item.accountName) {
    // 完全一致を試行
    accountId = accountIdMap.get(item.accountName) ?? null;
    // 完全一致しない場合、キーがaccountNameで始まるものを部分一致で探す
    if (!accountId) {
      for (const [key, id] of accountIdMap) {
        if (key.startsWith(item.accountName)) {
          accountId = id;
          break;
        }
      }
    }
  }

  // transferTarget から transfer_target_account_id をルックアップ
  let transferTargetAccountId: number | null = null;
  if (accountIdMap && item.transferTarget) {
    transferTargetAccountId = accountIdMap.get(item.transferTarget) ?? null;
    if (!transferTargetAccountId) {
      for (const [key, id] of accountIdMap) {
        if (key.startsWith(item.transferTarget)) {
          transferTargetAccountId = id;
          break;
        }
      }
    }
  }

  const data = {
    mfId: item.mfId,
    date: isoDate,
    accountId,
    category: item.category,
    subCategory: item.subCategory ?? null,
    description: item.description,
    amount: item.amount,
    type: item.type,
    isTransfer: item.isTransfer,
    isExcludedFromCalculation: item.isExcludedFromCalculation ?? false,
    transferTarget: item.transferTarget ?? null,
    transferTargetAccountId,
  };

  await upsertById(db, schema.transactions, eq(schema.transactions.mfId, item.mfId), data, data);
}

/**
 * 指定月にトランザクションが存在するかチェック
 * @param month "2026-01" 形式
 */
export async function hasTransactionsForMonth(db: Db, month: string): Promise<boolean> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.transactions)
    .where(like(schema.transactions.date, `${month}%`))
    .get();
  return (result?.count ?? 0) > 0;
}

export async function hasCashFlowPeriod(db: Db, month: string): Promise<boolean> {
  const result = await db
    .select({ id: schema.cashFlowPeriods.id })
    .from(schema.cashFlowPeriods)
    .where(eq(schema.cashFlowPeriods.month, month))
    .get();
  return result !== undefined;
}

export async function findExistingTransactionMfIds(db: Db, mfIds: string[]): Promise<Set<string>> {
  if (mfIds.length === 0) return new Set();

  const existingMfIds = new Set<string>();
  for (let i = 0; i < mfIds.length; i += BATCH_SIZE) {
    const batch = mfIds.slice(i, i + BATCH_SIZE);
    const rows = await db
      .select({ mfId: schema.transactions.mfId })
      .from(schema.transactions)
      .where(inArray(schema.transactions.mfId, batch))
      .all();

    for (const row of rows) {
      existingMfIds.add(row.mfId);
    }
  }

  return existingMfIds;
}

/**
 * 指定月のトランザクションを削除
 * @param month "2026-01" 形式
 */
export async function deleteTransactionsForMonth(db: DbExecutor, month: string): Promise<number> {
  const result = await db
    .delete(schema.transactions)
    .where(like(schema.transactions.date, `${month}%`))
    .run();
  return result.rowsAffected;
}

async function deleteTransactionsForDateRange(
  db: DbExecutor,
  range: TransactionDateRange & { toExclusive: string },
): Promise<number> {
  const result = await db
    .delete(schema.transactions)
    .where(
      and(
        gte(schema.transactions.date, range.from),
        lt(schema.transactions.date, range.toExclusive),
      ),
    )
    .run();
  return result.rowsAffected;
}

function resolveTransactionDateRange(
  month: string,
  range?: TransactionDateRange,
): TransactionDateRange {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("Invalid transaction month");
  }

  if (range) {
    const isValidDate = (value: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const date = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    };
    if (!isValidDate(range.from) || !isValidDate(range.to) || range.from > range.to) {
      throw new Error("Invalid transaction date range");
    }
    return range;
  }

  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export function assertNonOverlappingTransactionRanges(
  months: Array<{ dateRange?: TransactionDateRange; month: string }>,
): void {
  const ranges = months.map(({ dateRange, month }) =>
    resolveTransactionDateRange(month, dateRange),
  );

  for (let index = 0; index < ranges.length; index++) {
    const range = ranges[index]!;
    for (let previousIndex = 0; previousIndex < index; previousIndex++) {
      const previousRange = ranges[previousIndex]!;
      if (range.from <= previousRange.to && previousRange.from <= range.to) {
        throw new Error("Overlapping transaction date ranges");
      }
    }
  }
}

function getExclusiveRangeEnd(to: string): string {
  const nextDay = new Date(`${to}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return nextDay.toISOString().slice(0, 10);
}

/**
 * accountName から account_id をルックアップ
 */
function lookupAccountId(
  accountIdMap: Map<string, number> | undefined,
  name: string | undefined,
): number | null {
  if (!accountIdMap || !name) return null;

  // 完全一致を試行
  const exactMatch = accountIdMap.get(name);
  if (exactMatch) return exactMatch;

  // 部分一致で探す
  for (const [key, id] of accountIdMap) {
    if (key.startsWith(name)) {
      return id;
    }
  }
  return null;
}

/**
 * CashFlowItem を DB レコード形式に変換
 */
function prepareTransactionData(
  item: CashFlowItem,
  accountIdMap?: Map<string, number>,
  currentYear?: number,
): {
  mfId: string;
  date: string;
  accountId: number | null;
  category: string | null;
  subCategory: string | null;
  description: string;
  amount: number;
  type: string;
  isTransfer: boolean;
  isExcludedFromCalculation: boolean;
  transferTarget: string | null;
  transferTargetAccountId: number | null;
} {
  const isoDate = convertToIsoDate(item.date, currentYear);
  const accountId = lookupAccountId(accountIdMap, item.accountName);
  const transferTargetAccountId = lookupAccountId(accountIdMap, item.transferTarget);

  return {
    mfId: item.mfId,
    date: isoDate,
    accountId,
    category: item.category,
    subCategory: item.subCategory ?? null,
    description: item.description,
    amount: item.amount,
    type: item.type,
    isTransfer: item.isTransfer,
    isExcludedFromCalculation: item.isExcludedFromCalculation ?? false,
    transferTarget: item.transferTarget ?? null,
    transferTargetAccountId,
  };
}

/**
 * 指定月のトランザクションを保存（既存データは削除して上書き）
 */
export async function replaceTransactionsForMonth(
  db: DbExecutor,
  month: string,
  items: CashFlowItem[],
  accountIdMap?: Map<string, number>,
  dateRange?: TransactionDateRange,
  isComplete = items.length > 0,
): Promise<number> {
  if (items.some((item) => !item.mfId || item.mfId.startsWith("unknown"))) {
    throw new Error("Invalid transactions: missing transaction ID");
  }
  if (!isComplete) {
    throw new Error("Cannot replace an incomplete cash flow period");
  }
  const currentYear = parseInt(month.slice(0, 4), 10);
  const replacementRange = resolveTransactionDateRange(month, dateRange);
  const toExclusive = getExclusiveRangeEnd(replacementRange.to);
  const records = items.map((item) => prepareTransactionData(item, accountIdMap, currentYear));

  if (records.some(({ date }) => date < replacementRange.from || date >= toExclusive)) {
    throw new Error("Invalid transactions: item falls outside replacement date range");
  }

  // Validate the complete replacement before deleting existing data.
  const deleted = await deleteTransactionsForDateRange(db, { ...replacementRange, toExclusive });
  if (deleted > 0) {
    console.log(
      `  Deleted ${deleted} existing transactions for ${replacementRange.from} to ${replacementRange.to}`,
    );
  }

  const timestamp = now();

  // バルクinsert（BATCH_SIZE単位）
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const recordsWithTimestamps = batch.map((data) => {
      return {
        ...data,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    });

    await db
      .insert(schema.transactions)
      .values(recordsWithTimestamps)
      .onConflictDoUpdate({
        target: schema.transactions.mfId,
        set: {
          date: sql`excluded.date`,
          accountId: sql`excluded.account_id`,
          category: sql`excluded.category`,
          subCategory: sql`excluded.sub_category`,
          description: sql`excluded.description`,
          amount: sql`excluded.amount`,
          type: sql`excluded.type`,
          isTransfer: sql`excluded.is_transfer`,
          isExcludedFromCalculation: sql`excluded.is_excluded_from_calculation`,
          transferTarget: sql`excluded.transfer_target`,
          transferTargetAccountId: sql`excluded.transfer_target_account_id`,
          updatedAt: timestamp,
        },
      })
      .run();
  }

  await db
    .insert(schema.cashFlowPeriods)
    .values({
      month,
      periodStart: replacementRange.from,
      periodEnd: replacementRange.to,
      transactionCount: records.length,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: schema.cashFlowPeriods.month,
      set: {
        periodStart: replacementRange.from,
        periodEnd: replacementRange.to,
        transactionCount: records.length,
        updatedAt: timestamp,
      },
    })
    .run();

  return items.length;
}

export async function saveTransactionsForMonths(
  db: Db,
  months: Array<{
    dateRange?: TransactionDateRange;
    isComplete?: boolean;
    items: CashFlowItem[];
    month: string;
  }>,
  accountIdMap?: Map<string, number>,
): Promise<number[]> {
  assertNonOverlappingTransactionRanges(months);

  return db.transaction(async (transaction) => {
    const savedCounts: number[] = [];
    for (const { dateRange, isComplete, items, month } of months) {
      savedCounts.push(
        await replaceTransactionsForMonth(
          transaction,
          month,
          items,
          accountIdMap,
          dateRange,
          isComplete,
        ),
      );
    }
    return savedCounts;
  });
}

export async function saveTransactionsForMonth(
  db: Db,
  month: string,
  items: CashFlowItem[],
  accountIdMap?: Map<string, number>,
  dateRange?: TransactionDateRange,
  isComplete?: boolean,
): Promise<number> {
  const [savedCount = 0] = await saveTransactionsForMonths(
    db,
    [{ dateRange, isComplete, items, month }],
    accountIdMap,
  );
  return savedCount;
}
