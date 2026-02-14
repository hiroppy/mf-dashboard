import { eq, and, like, sql, inArray, or, notInArray } from "drizzle-orm";
import { getDb, type Db, schema } from "../index";
import { resolveGroupId, getAccountIdsForGroup } from "../shared/group-filter";
import { generateMonthRange } from "../shared/utils";

/**
 * グループ別収支計算
 *
 * 【収入】
 * 1. 通常の収入: type='income', is_excluded=0, account_id がグループ内
 * 2. グループ内→グループ外への振替: type='transfer', account_id がグループ内,
 *    transfer_target がグループ外、かつ共通グループなし → 収入
 * 3. 重複除外: 同一日・同一金額・同一account・同一transfer_target の振替は1件のみ
 *
 * 【支出】
 * 1. 通常の支出: type='expense', is_excluded=0, account_id がグループ内
 * 2. グループ外→グループ内への振替: type='transfer', account_id がグループ外,
 *    transfer_target がグループ内、かつ共通グループあり → 支出
 *
 * 【共通グループ】
 * 振替元と振替先が同じユーザー定義グループに属している場合、グループ内振替として除外。
 */

/**
 * グループ内アカウントのトランザクションを含める条件
 * getMonthlyCategoryTotals用に振替も含める（カテゴリ別表示で必要）
 * 収支計算では buildExpenseSum と getDeduplicatedTransferIncome で外部エンティティのみカウント
 */
export function buildIncludedTransactionCondition(accountIds: number[]) {
  return or(
    // 通常の収入/支出（振替以外で計算対象）
    and(
      sql`${schema.transactions.type} != 'transfer'`,
      sql`${schema.transactions.isExcludedFromCalculation} = 0`,
    ),
    // グループ内→グループ外への振替（カテゴリ別表示用）
    and(
      sql`${schema.transactions.type} = 'transfer'`,
      sql`${schema.transactions.transferTargetAccountId} IS NOT NULL`,
      notInArray(schema.transactions.transferTargetAccountId, accountIds),
    ),
  );
}

/**
 * グループ外アカウントからグループ内への振替を含める条件（収入として扱う）
 */
export function buildOutsideTransferCondition(accountIds: number[]) {
  return and(
    sql`${schema.transactions.type} = 'transfer'`,
    sql`${schema.transactions.transferTargetAccountId} IS NOT NULL`,
    notInArray(schema.transactions.accountId, accountIds),
    inArray(schema.transactions.transferTargetAccountId, accountIds),
  );
}

/**
 * グループの収支計算に含めるべきトランザクションの共通条件を構築
 * - グループ内アカウントのトランザクション（通常の収入/支出 + グループ外への振替）
 * - グループ外からグループ内への振替（収入として扱う）
 */
export function buildGroupTransactionCondition(accountIds: number[]) {
  return or(
    and(
      inArray(schema.transactions.accountId, accountIds),
      buildIncludedTransactionCondition(accountIds),
    ),
    buildOutsideTransferCondition(accountIds),
  );
}

/**
 * 通常の収入を計算するSQL（type='income'のみ）
 */
export function buildRegularIncomeSum() {
  return sql<number>`sum(case
    when ${schema.transactions.type} = 'income' then ${schema.transactions.amount}
    else 0
  end)`.as("regular_income");
}

const GROUP_NONE_ID = "0";

/**
 * 振替の収入/支出分類を判定
 * @returns 'income' | 'expense' | null (nullは除外すべき振替)
 */
export async function classifyTransfer(
  db: Db,
  accountIdSet: Set<number>,
  sourceAccountId: number,
  targetAccountId: number,
): Promise<"income" | "expense" | null> {
  // 共通グループがある場合は内部振替として除外
  if (await hasCommonGroup(db, sourceAccountId, targetAccountId)) {
    return null;
  }

  const isSourceInGroup = accountIdSet.has(sourceAccountId);
  const isTargetInGroup = accountIdSet.has(targetAccountId);

  if (isSourceInGroup && !isTargetInGroup) {
    return "income"; // グループ内→外 = 収入
  } else if (!isSourceInGroup && isTargetInGroup) {
    return "expense"; // グループ外→内 = 支出
  }
  return null; // グループ内→内 = 除外
}

/**
 * 2つのアカウントが共通のグループ（グループ選択なしを除く）に属しているかチェック
 * 共通グループがある場合、振替は内部振替として収支にカウントしない
 */
export async function hasCommonGroup(
  db: Db,
  accountId1: number,
  accountId2: number,
): Promise<boolean> {
  const groups1 = (
    await db
      .select({ groupId: schema.groupAccounts.groupId })
      .from(schema.groupAccounts)
      .where(eq(schema.groupAccounts.accountId, accountId1))
      .all()
  )
    .map((g) => g.groupId)
    .filter((id) => id !== GROUP_NONE_ID);

  const groups2Set = new Set(
    (
      await db
        .select({ groupId: schema.groupAccounts.groupId })
        .from(schema.groupAccounts)
        .where(eq(schema.groupAccounts.accountId, accountId2))
        .all()
    )
      .map((g) => g.groupId)
      .filter((id) => id !== GROUP_NONE_ID),
  );

  return groups1.some((g) => groups2Set.has(g));
}

/**
 * グループ内→グループ外への振替収入を計算（重複除外）
 * 同一日・同一金額・同一account・同一transfer_targetの振替は1件のみカウント
 *
 * 収入としてカウントする条件:
 * - accountIdがグループ内（振替元がグループ内）
 * - transfer_targetがグループ外（振替先がグループ外）
 * - 振替元と振替先に共通グループがない（共通グループ間振替は除外）
 *
 * Money Forward本家では、グループ内のアカウントからグループ外への振替を
 * 収入としてカウントしている。ただし、振替元と振替先が共通のグループに属する場合は除外。
 */
export async function getDeduplicatedTransferIncome(
  db: Db,
  accountIds: number[],
  dateCondition?: string,
): Promise<Map<string, number>> {
  // 振替トランザクションを取得
  // グループ内→グループ外への振替を収入としてカウント
  const query = db
    .select({
      date: schema.transactions.date,
      amount: schema.transactions.amount,
      accountId: schema.transactions.accountId,
      transferTargetAccountId: schema.transactions.transferTargetAccountId,
    })
    .from(schema.transactions)
    .where(
      and(
        sql`${schema.transactions.type} = 'transfer'`,
        inArray(schema.transactions.accountId, accountIds),
        sql`${schema.transactions.transferTargetAccountId} IS NOT NULL`,
        notInArray(schema.transactions.transferTargetAccountId, accountIds),
        dateCondition ? like(schema.transactions.date, `${dateCondition}%`) : sql`1=1`,
      ),
    );

  const transfers = await query.all();

  // 重複除外: (date, amount, accountId, transferTargetAccountId) でユニーク化
  const seen = new Set<string>();
  const monthlyTotals = new Map<string, number>();
  const accountIdSet = new Set(accountIds);

  for (const t of transfers) {
    if (!t.date || !t.transferTargetAccountId || t.accountId === null) continue;

    // classifyTransferで収入として判定される振替のみカウント
    const classification = await classifyTransfer(
      db,
      accountIdSet,
      t.accountId,
      t.transferTargetAccountId,
    );
    if (classification !== "income") continue;

    const key = `${t.date}-${t.amount}-${t.accountId}-${t.transferTargetAccountId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const month = t.date.substring(0, 7);
    monthlyTotals.set(month, (monthlyTotals.get(month) || 0) + t.amount);
  }

  return monthlyTotals;
}

/**
 * 支出の合計を計算するSQL
 * - 通常の支出のみ（type='expense'）
 *
 * 振替は基本的に支出に含めない。
 * グループ外→グループ内への振替で共通グループがある場合は別途計算する。
 */
export function buildExpenseSum(_accountIds: number[]) {
  return sql<number>`sum(case
    when ${schema.transactions.type} = 'expense' then ${schema.transactions.amount}
    else 0
  end)`.as("total_expense");
}

/**
 * グループ外→グループ内への振替支出を計算（重複除外）
 * 同一日・同一金額・同一account・同一transfer_targetの振替は1件のみカウント
 *
 * 支出としてカウントする条件:
 * - accountIdがグループ外（振替元がグループ外）
 * - transfer_targetがグループ内（振替先がグループ内）
 * - 振替先アカウントで同一日・同一金額の通常トランザクションがない（重複回避）
 *
 * Money Forward本家では、振替がtype=expense/incomeとして別途記録されている場合は
 * その通常トランザクションでカウントされる。振替としてのみ記録されている場合は
 * 支出としてカウントする必要がある。
 */
export async function getDeduplicatedTransferExpense(
  db: Db,
  accountIds: number[],
  dateCondition?: string,
): Promise<Map<string, number>> {
  // 振替トランザクションを取得
  // グループ外→グループ内への振替を支出としてカウント
  const query = db
    .select({
      date: schema.transactions.date,
      amount: schema.transactions.amount,
      accountId: schema.transactions.accountId,
      transferTargetAccountId: schema.transactions.transferTargetAccountId,
    })
    .from(schema.transactions)
    .where(
      and(
        sql`${schema.transactions.type} = 'transfer'`,
        notInArray(schema.transactions.accountId, accountIds),
        sql`${schema.transactions.transferTargetAccountId} IS NOT NULL`,
        inArray(schema.transactions.transferTargetAccountId, accountIds),
        dateCondition ? like(schema.transactions.date, `${dateCondition}%`) : sql`1=1`,
      ),
    );

  const transfers = await query.all();

  // 重複除外: (date, amount, accountId, transferTargetAccountId) でユニーク化
  const seen = new Set<string>();
  const monthlyTotals = new Map<string, number>();

  for (const t of transfers) {
    if (!t.date || !t.transferTargetAccountId || t.accountId === null) continue;

    // 振替先アカウントで同一日・同一金額の通常トランザクションがある場合は除外
    // （既に通常支出としてカウントされているため）
    const existingNormalTx = await db
      .select({ id: schema.transactions.id })
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.accountId, t.transferTargetAccountId),
          eq(schema.transactions.date, t.date),
          eq(schema.transactions.amount, t.amount),
          sql`${schema.transactions.type} IN ('income', 'expense')`,
        ),
      )
      .get();

    if (existingNormalTx) continue;

    const key = `${t.date}-${t.amount}-${t.accountId}-${t.transferTargetAccountId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const month = t.date.substring(0, 7);
    monthlyTotals.set(month, (monthlyTotals.get(month) || 0) + t.amount);
  }

  return monthlyTotals;
}

// Get the latest monthly summary (dynamically calculated from transactions, filtered by group)
export async function getLatestMonthlySummary(groupIdParam?: string, db: Db = getDb()) {
  const groupId = await resolveGroupId(db, groupIdParam);
  if (!groupId) return undefined;

  // Get the most recent month's summary
  const summaries = await getMonthlySummaries({ limit: 1, groupId }, db);
  return summaries[0];
}

// Get monthly summaries calculated from transactions (filtered by group)
// トランザクションがない月も含めて、最古の月から現在月までの全ての月を返す
export async function getMonthlySummaries(
  options?: { limit?: number; groupId?: string },
  db: Db = getDb(),
) {
  const groupId = await resolveGroupId(db, options?.groupId);
  if (!groupId) return [];

  // Get account IDs for group
  const accountIds = await getAccountIdsForGroup(db, groupId);
  if (accountIds.length === 0) return [];

  // 最古の月を取得
  const oldestResult = await db
    .select({
      month: sql<string>`MIN(substr(${schema.transactions.date}, 1, 7))`.as("month"),
    })
    .from(schema.transactions)
    .where(inArray(schema.transactions.accountId, accountIds))
    .get();

  if (!oldestResult?.month) return [];

  // 最古の月から現在月までの全ての月を生成
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const allMonths = generateMonthRange(oldestResult.month, currentMonth);

  // 通常の収入/支出を集計
  const regularResults = await db
    .select({
      month: sql<string>`substr(${schema.transactions.date}, 1, 7)`.as("month"),
      regularIncome: buildRegularIncomeSum(),
      totalExpense: buildExpenseSum(accountIds),
    })
    .from(schema.transactions)
    .where(buildGroupTransactionCondition(accountIds))
    .groupBy(sql`substr(${schema.transactions.date}, 1, 7)`)
    .all();

  // DB結果をMapに変換
  const resultMap = new Map<string, { regularIncome: number; totalExpense: number }>();
  for (const r of regularResults) {
    resultMap.set(r.month, {
      regularIncome: r.regularIncome || 0,
      totalExpense: r.totalExpense || 0,
    });
  }

  // 重複除外した振替収入を取得
  const transferIncomeMap = await getDeduplicatedTransferIncome(db, accountIds);

  // 重複除外した振替支出を取得
  const transferExpenseMap = await getDeduplicatedTransferExpense(db, accountIds);

  // 全ての月に対してサマリーを生成（トランザクションがない月は0で埋める）
  const summaries = allMonths.map((month) => {
    const data = resultMap.get(month) || { regularIncome: 0, totalExpense: 0 };
    const transferIncome = transferIncomeMap.get(month) || 0;
    const transferExpense = transferExpenseMap.get(month) || 0;
    const totalIncome = data.regularIncome + transferIncome;
    const totalExpense = data.totalExpense + transferExpense;
    return {
      month,
      totalIncome,
      totalExpense,
      netIncome: totalIncome - totalExpense,
    };
  });

  if (options?.limit) {
    return summaries.slice(0, options.limit);
  }
  return summaries;
}

// Get all available months from oldest transaction to current month (filtered by group)
export async function getAvailableMonths(groupIdParam?: string, db: Db = getDb()) {
  const groupId = await resolveGroupId(db, groupIdParam);
  if (!groupId) return [];

  // Get account IDs for group
  const accountIds = await getAccountIdsForGroup(db, groupId);
  if (accountIds.length === 0) return [];

  // Get the oldest month from transactions
  const oldestResult = await db
    .select({
      month: sql<string>`MIN(substr(${schema.transactions.date}, 1, 7))`.as("month"),
    })
    .from(schema.transactions)
    .where(inArray(schema.transactions.accountId, accountIds))
    .get();

  if (!oldestResult?.month) return [];

  // Generate all months from oldest to current
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const months = generateMonthRange(oldestResult.month, currentMonth);

  return months.map((month) => ({ month }));
}

// Get monthly summary for a specific month (dynamically calculated from transactions, filtered by group)
export async function getMonthlySummaryByMonth(
  month: string,
  groupIdParam?: string,
  db: Db = getDb(),
) {
  const groupId = await resolveGroupId(db, groupIdParam);
  if (!groupId) return undefined;

  // Get account IDs for group
  const accountIds = await getAccountIdsForGroup(db, groupId);
  if (accountIds.length === 0) return undefined;

  // 通常の収入/支出を集計
  const result = await db
    .select({
      regularIncome: buildRegularIncomeSum(),
      totalExpense: buildExpenseSum(accountIds),
    })
    .from(schema.transactions)
    .where(
      and(like(schema.transactions.date, `${month}%`), buildGroupTransactionCondition(accountIds)),
    )
    .get();

  if (!result) return undefined;

  // 重複除外した振替収入を取得
  const transferIncomeMap = await getDeduplicatedTransferIncome(db, accountIds, month);
  const transferIncome = transferIncomeMap.get(month) || 0;
  const totalIncome = (result.regularIncome || 0) + transferIncome;

  // 重複除外した振替支出を取得
  const transferExpenseMap = await getDeduplicatedTransferExpense(db, accountIds, month);
  const transferExpense = transferExpenseMap.get(month) || 0;
  const totalExpense = (result.totalExpense || 0) + transferExpense;

  return {
    month,
    groupId,
    totalIncome,
    totalExpense,
    netIncome: totalIncome - totalExpense,
  };
}

// Get category totals for a specific month (dynamically calculated from transactions, filtered by group)
// NOTE: MoneyForwardでは、グループによって同じトランザクションの表示が異なる。
// 例: 「グループ選択なし」では振替（グレー、カテゴリなし）だが、
//     特定のグループでは収入/給与として表示される。
// 現在のクローラーは「グループ選択なし」でスクレイプしているため、
// グループ固有のカテゴリ情報を取得できない。
//
// 振替の分類はhasCommonGroupを使用して、getMonthlySummaryByMonthと同じロジックで行う。
// 共通グループがある場合は内部振替として収支に含めない。
// 共通グループがない場合:
// - グループ内→グループ外: 収入としてカウント
// - グループ外→グループ内: 支出としてカウント（ただし既存の通常TXと重複する場合は除外）
export async function getMonthlyCategoryTotals(
  month: string,
  groupIdParam?: string,
  db: Db = getDb(),
) {
  const groupId = await resolveGroupId(db, groupIdParam);
  if (!groupId) return [];

  // Get account IDs for group
  const accountIds = await getAccountIdsForGroup(db, groupId);
  if (accountIds.length === 0) return [];

  // Aggregate transactions by category for the given month
  // Includes: regular income/expense + transfers from/to outside the group
  const results = await db
    .select({
      category: schema.transactions.category,
      type: schema.transactions.type,
      transferTargetAccountId: schema.transactions.transferTargetAccountId,
      accountId: schema.transactions.accountId,
      totalAmount: sql<number>`sum(${schema.transactions.amount})`.as("total_amount"),
    })
    .from(schema.transactions)
    .where(
      and(like(schema.transactions.date, `${month}%`), buildGroupTransactionCondition(accountIds)),
    )
    .groupBy(
      schema.transactions.category,
      schema.transactions.type,
      schema.transactions.transferTargetAccountId,
      schema.transactions.accountId,
    )
    .all();

  // Transform results: transfers should be treated as income/expense based on classifyTransfer
  // This matches the logic in getMonthlySummaryByMonth / getDeduplicatedTransferIncome
  type CategoryTotal = { category: string; type: "income" | "expense"; totalAmount: number };
  const categoryMap = new Map<string, CategoryTotal>();

  const accountIdSet = new Set(accountIds);

  for (const r of results) {
    let effectiveCategory = r.category;
    let effectiveType: "income" | "expense" = r.type as "income" | "expense";

    if (r.type === "transfer" && r.transferTargetAccountId !== null && r.accountId !== null) {
      // classifyTransferで振替の分類を判定
      const classification = await classifyTransfer(
        db,
        accountIdSet,
        r.accountId,
        r.transferTargetAccountId,
      );
      if (classification === null) {
        // 内部振替として除外
        continue;
      }
      effectiveCategory = classification === "income" ? "収入" : "支出";
      effectiveType = classification;
    }

    // Skip if category is still null (shouldn't happen after above logic)
    if (effectiveCategory === null) continue;

    const key = `${effectiveCategory}-${effectiveType}`;
    const existing = categoryMap.get(key);
    if (existing) {
      existing.totalAmount += r.totalAmount;
    } else {
      categoryMap.set(key, {
        category: effectiveCategory,
        type: effectiveType,
        totalAmount: r.totalAmount,
      });
    }
  }

  return Array.from(categoryMap.values()).map((r) => ({
    month,
    category: r.category,
    type: r.type,
    totalAmount: r.totalAmount,
  }));
}

// Get year-to-date summary (dynamically calculated from transactions, filtered by group)
export async function getYearToDateSummary(
  options?: { year?: number; groupId?: string },
  db: Db = getDb(),
) {
  const groupId = await resolveGroupId(db, options?.groupId);
  const targetYear = options?.year || new Date().getFullYear();

  if (!groupId) {
    return {
      year: targetYear,
      totalIncome: 0,
      totalExpense: 0,
      balance: 0,
      monthCount: 0,
    };
  }

  const yearPrefix = `${targetYear}-`;

  // Get account IDs for group
  const accountIds = await getAccountIdsForGroup(db, groupId);
  if (accountIds.length === 0) {
    return {
      year: targetYear,
      totalIncome: 0,
      totalExpense: 0,
      balance: 0,
      monthCount: 0,
    };
  }

  // 通常の収入/支出を集計
  const result = await db
    .select({
      regularIncome: buildRegularIncomeSum(),
      totalExpense: buildExpenseSum(accountIds),
      monthCount: sql<number>`count(distinct substr(${schema.transactions.date}, 1, 7))`.as(
        "month_count",
      ),
    })
    .from(schema.transactions)
    .where(
      and(
        like(schema.transactions.date, `${yearPrefix}%`),
        buildGroupTransactionCondition(accountIds),
      ),
    )
    .get();

  // 重複除外した振替収入を取得（年全体）
  const transferIncomeMap = await getDeduplicatedTransferIncome(db, accountIds, yearPrefix);
  let transferIncome = 0;
  for (const amount of transferIncomeMap.values()) {
    transferIncome += amount;
  }
  const totalIncome = (result?.regularIncome || 0) + transferIncome;

  // 重複除外した振替支出を取得（年全体）
  const transferExpenseMap = await getDeduplicatedTransferExpense(db, accountIds, yearPrefix);
  let transferExpense = 0;
  for (const amount of transferExpenseMap.values()) {
    transferExpense += amount;
  }
  const totalExpense = (result?.totalExpense || 0) + transferExpense;

  return {
    year: targetYear,
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    monthCount: result?.monthCount || 0,
  };
}

// Get expense breakdown by fixed vs variable (filtered by group)
export async function getExpenseByFixedVariable(
  month: string,
  groupIdParam?: string,
  db: Db = getDb(),
) {
  const groupId = await resolveGroupId(db, groupIdParam);
  const categoryTotals = await getMonthlyCategoryTotals(month, groupId ?? undefined, db);

  // Return empty result if no group
  if (!groupId) {
    return {
      fixed: { total: 0, categories: [] as Array<{ category: string; amount: number }> },
      variable: { total: 0, categories: [] as Array<{ category: string; amount: number }> },
    };
  }

  const targets = await db
    .select()
    .from(schema.spendingTargets)
    .where(eq(schema.spendingTargets.groupId, groupId))
    .all();

  const fixedCategoryNames = new Set(
    targets.filter((t) => t.type === "fixed").map((t) => t.categoryName),
  );

  let fixedTotal = 0;
  let variableTotal = 0;
  const fixedCategories: Array<{ category: string; amount: number }> = [];
  const variableCategories: Array<{ category: string; amount: number }> = [];

  for (const item of categoryTotals) {
    if (item.type !== "expense") continue;

    const isFixed = fixedCategoryNames.has(item.category);
    if (isFixed) {
      fixedTotal += item.totalAmount;
      fixedCategories.push({
        category: item.category,
        amount: item.totalAmount,
      });
    } else {
      variableTotal += item.totalAmount;
      variableCategories.push({
        category: item.category,
        amount: item.totalAmount,
      });
    }
  }

  return {
    fixed: {
      total: fixedTotal,
      categories: fixedCategories.sort((a, b) => b.amount - a.amount),
    },
    variable: {
      total: variableTotal,
      categories: variableCategories.sort((a, b) => b.amount - a.amount),
    },
  };
}
