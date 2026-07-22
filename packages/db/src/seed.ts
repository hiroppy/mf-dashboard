/**
 * デモデータ seed スクリプト
 *
 * 独身社会人（30代）を想定した1年間の家計データを生成する。
 * 総資産は約570万円、銀行・証券・暗号資産・カード・電子マネー等すべての項目を網羅し、
 * 収支・振替・取引の整合性を保つ。
 *
 * 使い方:
 *   DB_PATH=../../data/demo.db npx tsx src/seed.ts
 *   DB_PATH=../../data/demo.db npx tsx src/seed.ts --period=2026-03  # 2026-03まで生成
 */

import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema/schema";
import {
  ALL_GROUP_IDS,
  GROUP_ID,
  GROUP_ID_INVESTMENT,
  GROUP_ID_LIVING,
  accountDefs,
  assetCategoryNames,
  buildAccountCategoryMap,
  getGroupsForAccount,
  getGroupsForCategory,
  institutionCategoryDefs,
} from "./seed/accounts";
import { seedAssetHistory } from "./seed/asset-history";
import { calculateHoldingTotals, holdingDefs } from "./seed/holdings";
import { seedInsights } from "./seed/insights";
import {
  createPick,
  createRandInt,
  createRng,
  dateStr,
  daysInMonth,
  forEachMonth,
  monthStr,
} from "./seed/shared";
import { seedSpendingTargets } from "./seed/spending-targets";
import {
  getDescription,
  txTemplates,
  type GroupMonthlyData,
  type TxRecord,
} from "./seed/transactions";

// ---------------------------------------------------------------------------
// DB 初期化
// ---------------------------------------------------------------------------
const dbPath =
  process.env.DB_PATH || join(import.meta.dirname, "..", "..", "..", "data", "demo.db");

if (existsSync(dbPath)) unlinkSync(dbPath);

const client = createClient({ url: `file:${dbPath}` });
const db = drizzle(client, { schema });
await migrate(db, { migrationsFolder: join(import.meta.dirname, "../drizzle") });

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------
let fixedTimestamp: string;
const now = () => fixedTimestamp;
let mfIdCounter = 0;
const mfId = () => `demo_${String(++mfIdCounter).padStart(6, "0")}`;

const random = createRng(20250201);
const randInt = createRandInt(random);
const pick = createPick(random);

// ---------------------------------------------------------------------------
// 定数: 期間設定（冪等性のため固定期間を使用）
// ---------------------------------------------------------------------------
const YEAR_START = 2025;
const MONTH_START = 2; // 2025-02
const FIXED_DAY = 24; // 月内の固定日

const { values: args } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: { period: { type: "string" } },
  strict: false,
});
const period = typeof args.period === "string" ? args.period : undefined;
if (period && !/^\d{4}-\d{2}$/.test(period)) {
  console.error("--period must be in YYYY-MM format (e.g., --period=2026-03)");
  process.exit(1);
}
const currentDate = new Date();
const YEAR_END = period ? Number(period.split("-")[0]) : currentDate.getFullYear();
const MONTH_END = period ? Number(period.split("-")[1]) : currentDate.getMonth() + 1;
fixedTimestamp = `${dateStr(YEAR_END, MONTH_END, FIXED_DAY)}T00:00:00.000Z`;
const range = {
  yearStart: YEAR_START,
  monthStart: MONTH_START,
  yearEnd: YEAR_END,
  monthEnd: MONTH_END,
};

console.log(
  `期間: ${YEAR_START}-${String(MONTH_START).padStart(2, "0")} 〜 ${YEAR_END}-${String(MONTH_END).padStart(2, "0")}`,
);

// ---------------------------------------------------------------------------
// 1. グループ
// ---------------------------------------------------------------------------
await db
  .insert(schema.groups)
  .values({
    id: GROUP_ID,
    name: "グループ選択なし",
    isCurrent: true,
    lastScrapedAt: now(),
    createdAt: now(),
    updatedAt: now(),
  })
  .run();

await db
  .insert(schema.groups)
  .values({
    id: GROUP_ID_INVESTMENT,
    name: "投資",
    isCurrent: false,
    lastScrapedAt: now(),
    createdAt: now(),
    updatedAt: now(),
  })
  .run();

await db
  .insert(schema.groups)
  .values({
    id: GROUP_ID_LIVING,
    name: "生活",
    isCurrent: false,
    lastScrapedAt: now(),
    createdAt: now(),
    updatedAt: now(),
  })
  .run();

// ---------------------------------------------------------------------------
// 2. 機関カテゴリ
// ---------------------------------------------------------------------------
const instCatIds: Record<string, number> = {};
for (const category of institutionCategoryDefs) {
  const ts = now();
  const result = await db
    .insert(schema.institutionCategories)
    .values({
      name: category.name,
      displayOrder: category.order,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning({ id: schema.institutionCategories.id })
    .get();
  instCatIds[category.name] = result!.id;
}

// ---------------------------------------------------------------------------
// 3. 資産カテゴリ
// ---------------------------------------------------------------------------
const assetCatIds: Record<string, number> = {};
for (const name of assetCategoryNames) {
  const ts = now();
  const result = await db
    .insert(schema.assetCategories)
    .values({
      name,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning({ id: schema.assetCategories.id })
    .get();
  assetCatIds[name] = result!.id;
}

// ---------------------------------------------------------------------------
// 4. アカウント
// ---------------------------------------------------------------------------
const accountIds: Record<string, number> = {};
for (const account of accountDefs) {
  const ts = now();
  const result = await db
    .insert(schema.accounts)
    .values({
      mfId: mfId(),
      name: account.name,
      type: account.type,
      institution: account.institution,
      categoryId: instCatIds[account.categoryName],
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning({ id: schema.accounts.id })
    .get();
  accountIds[account.name] = result!.id;

  for (const groupId of getGroupsForCategory(account.categoryName)) {
    await db
      .insert(schema.groupAccounts)
      .values({
        groupId,
        accountId: result!.id,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
  }
}

const accountCategoryMap = buildAccountCategoryMap();
const getGroupsForAccountName = (accountName: string) =>
  getGroupsForAccount(accountName, accountCategoryMap);

// ---------------------------------------------------------------------------
// 5. 保有資産 (Holdings) + アカウントステータス
// ---------------------------------------------------------------------------
const { totalAssets, totalLiabilities, netAssets } = calculateHoldingTotals();
console.log(
  `資産合計: ¥${totalAssets.toLocaleString()} / 負債合計: ¥${totalLiabilities.toLocaleString()} / 純資産: ¥${netAssets.toLocaleString()}`,
);

const snapshotDate = dateStr(YEAR_END, MONTH_END, FIXED_DAY);
const snapshotResult = await db
  .insert(schema.dailySnapshots)
  .values({
    groupId: GROUP_ID,
    date: snapshotDate,
    createdAt: now(),
    updatedAt: now(),
  })
  .returning({ id: schema.dailySnapshots.id })
  .get();
const snapshotId = snapshotResult!.id;

const accountTotalAssets: Record<number, number> = {};
for (const holding of holdingDefs) {
  const accId = accountIds[holding.accountName];
  const catId = holding.assetCategory ? assetCatIds[holding.assetCategory] : null;
  const ts = now();

  const holdingResult = await db
    .insert(schema.holdings)
    .values({
      mfId: mfId(),
      accountId: accId,
      categoryId: catId,
      name: holding.name,
      code: holding.code ?? null,
      type: holding.type,
      liabilityCategory: holding.liabilityCategory ?? null,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning({ id: schema.holdings.id })
    .get();

  await db
    .insert(schema.holdingValues)
    .values({
      holdingId: holdingResult!.id,
      snapshotId,
      amount: holding.amount,
      quantity: holding.quantity ?? null,
      unitPrice: holding.unitPrice ?? null,
      avgCostPrice: holding.avgCostPrice ?? null,
      dailyChange: holding.dailyChange ?? null,
      unrealizedGain: holding.unrealizedGain ?? null,
      unrealizedGainPct: holding.unrealizedGainPct ?? null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  if (holding.type === "asset") {
    accountTotalAssets[accId] = (accountTotalAssets[accId] || 0) + holding.amount;
  }
}

for (const account of accountDefs) {
  const accId = accountIds[account.name];
  const ts = now();
  let status = "ok";
  let errorMessage: string | null = null;

  if (account.name === "三井住友カード(NL)") {
    status = "error";
    errorMessage = "金融機関のメンテナンス中のため、データを取得できませんでした。";
  } else if (account.name === "楽天カード") {
    status = "updating";
  }

  await db
    .insert(schema.accountStatuses)
    .values({
      accountId: accId,
      status,
      lastUpdated: ts,
      totalAssets: accountTotalAssets[accId] || 0,
      errorMessage,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
}

// ---------------------------------------------------------------------------
// 6. トランザクション (1年分)
// ---------------------------------------------------------------------------
const allTransactions: TxRecord[] = [];
const groupMonthlyData: Record<string, GroupMonthlyData> = {};
for (const groupId of ALL_GROUP_IDS) {
  groupMonthlyData[groupId] = { income: {}, expense: {}, catTotals: {} };
}

forEachMonth(range, (y, m) => {
  const ms = monthStr(y, m);
  for (const groupId of ALL_GROUP_IDS) {
    groupMonthlyData[groupId].income[ms] = 0;
    groupMonthlyData[groupId].expense[ms] = 0;
    groupMonthlyData[groupId].catTotals[ms] = {};
  }

  const maxDay = daysInMonth(y, m);

  for (const tmpl of txTemplates) {
    if (tmpl.description === "夏季賞与" && m !== 6) continue;
    if (tmpl.description === "冬季賞与" && m !== 12) continue;
    if (tmpl.onlyMonths && !tmpl.onlyMonths.includes(m)) continue;

    const accId = accountIds[tmpl.accountName] ?? null;
    const addToGroupTotals = (tx: TxRecord, month: string) => {
      if (tx.isExcludedFromCalculation) return;
      const groups = getGroupsForAccountName(tx.accountName);
      for (const groupId of groups) {
        const data = groupMonthlyData[groupId];
        if (tx.type === "income") {
          data.income[month] += tx.amount;
          if (tx.category) {
            if (!data.catTotals[month][tx.category]) {
              data.catTotals[month][tx.category] = { income: 0, expense: 0 };
            }
            data.catTotals[month][tx.category].income += tx.amount;
          }
        }
        if (tx.type === "expense") {
          data.expense[month] += tx.amount;
          if (tx.category) {
            if (!data.catTotals[month][tx.category]) {
              data.catTotals[month][tx.category] = { income: 0, expense: 0 };
            }
            data.catTotals[month][tx.category].expense += tx.amount;
          }
        }
      }
    };

    const transferTargetAccId = tmpl.transferTarget
      ? (accountIds[tmpl.transferTarget] ?? null)
      : null;

    if (tmpl.frequency === "monthly") {
      const day = Math.min(tmpl.fixedDay!, maxDay);
      const amount = randInt(tmpl.minAmount, tmpl.maxAmount);
      const desc = tmpl.description || getDescription(tmpl.category, tmpl.subCategory, pick);

      const tx: TxRecord = {
        mfId: mfId(),
        date: dateStr(y, m, day),
        accountId: accId,
        accountName: tmpl.accountName,
        category: tmpl.category || null,
        subCategory: tmpl.subCategory || null,
        description: desc || null,
        amount,
        type: tmpl.type,
        isTransfer: tmpl.isTransfer ?? false,
        isExcludedFromCalculation: tmpl.isExcludedFromCalculation ?? false,
        transferTarget: tmpl.transferTarget ?? null,
        transferTargetAccountId: transferTargetAccId,
      };
      allTransactions.push(tx);
      addToGroupTotals(tx, ms);
    } else if (tmpl.frequency === "random") {
      const count = tmpl.occurrences ?? 1;
      for (let i = 0; i < count; i++) {
        const day = randInt(1, maxDay);
        const amount = randInt(tmpl.minAmount, tmpl.maxAmount);
        const desc = tmpl.description || getDescription(tmpl.category, tmpl.subCategory, pick);

        const tx: TxRecord = {
          mfId: mfId(),
          date: dateStr(y, m, day),
          accountId: accId,
          accountName: tmpl.accountName,
          category: tmpl.category || null,
          subCategory: tmpl.subCategory || null,
          description: desc || null,
          amount,
          type: tmpl.type,
          isTransfer: tmpl.isTransfer ?? false,
          isExcludedFromCalculation: tmpl.isExcludedFromCalculation ?? false,
          transferTarget: tmpl.transferTarget ?? null,
          transferTargetAccountId: transferTargetAccId,
        };
        allTransactions.push(tx);
        addToGroupTotals(tx, ms);
      }
    }
  }
});

await db.transaction(async (tx) => {
  for (const txRecord of allTransactions) {
    const ts = now();
    await tx
      .insert(schema.transactions)
      .values({
        mfId: txRecord.mfId,
        date: txRecord.date,
        accountId: txRecord.accountId,
        category: txRecord.category,
        subCategory: txRecord.subCategory,
        description: txRecord.description,
        amount: txRecord.amount,
        type: txRecord.type,
        isTransfer: txRecord.isTransfer,
        isExcludedFromCalculation: txRecord.isExcludedFromCalculation,
        transferTarget: txRecord.transferTarget,
        transferTargetAccountId: txRecord.transferTargetAccountId,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
  }
});

console.log(`取引件数: ${allTransactions.length}`);

// ---------------------------------------------------------------------------
// 7. asset_history (日次)
// ---------------------------------------------------------------------------
const assetHistoryDays = await seedAssetHistory({
  db,
  range,
  now,
  randInt,
  totalAssets,
  groupMonthlyData,
  accountCategoryMap,
  getGroupsForAccount: getGroupsForAccountName,
});
console.log(`資産履歴日数: ${assetHistoryDays}`);

// ---------------------------------------------------------------------------
// 8. spending_targets (予算)
// ---------------------------------------------------------------------------
await seedSpendingTargets(db, now);

// ---------------------------------------------------------------------------
// 9. Analytics Reports (from pre-generated LLM insights)
// ---------------------------------------------------------------------------
const insightCount = await seedInsights({
  db,
  now,
  yearEnd: YEAR_END,
  monthEnd: MONTH_END,
  fixedDay: FIXED_DAY,
});
if (insightCount > 0) {
  console.log(`インサイトデータを挿入しました (${insightCount}グループ)`);
}

// ---------------------------------------------------------------------------
// 完了
// ---------------------------------------------------------------------------
client.close();

const yearTotalIncome = Object.values(groupMonthlyData[GROUP_ID].income).reduce((s, v) => s + v, 0);
const yearTotalExpense = Object.values(groupMonthlyData[GROUP_ID].expense).reduce(
  (s, v) => s + v,
  0,
);

console.log(`\nデモデータの生成が完了しました: ${dbPath}`);
console.log(`総資産: ¥${totalAssets.toLocaleString()}`);
console.log(`総負債: ¥${totalLiabilities.toLocaleString()}`);
console.log(`純資産: ¥${netAssets.toLocaleString()}`);
console.log(`年間収入合計: ¥${yearTotalIncome.toLocaleString()}`);
console.log(`年間支出合計: ¥${yearTotalExpense.toLocaleString()}`);
