import { getJstTodayIsoDate } from "@mf-dashboard/date-utils";
import { eq } from "drizzle-orm";
import type { Db, DbExecutor } from "../index";
import { schema } from "../index";
import type { CashFlowItem, ScrapedData } from "../types";
import { now } from "../utils";
import {
  upsertAccounts,
  saveAccountStatuses,
  buildAccountIdMap,
  updateAccountCategory,
} from "./accounts";
import { getOrCreateCategory } from "./categories";
import {
  deleteGroupsNotIn,
  upsertGroup,
  updateGroupLastScrapedAt,
  clearGroupAccountLinks,
  linkAccountsToGroup,
} from "./groups";
import { createHolding, saveHoldingValue } from "./holdings";
import { createSnapshot } from "./snapshots";
import { saveSpendingTargets } from "./spending-targets";
import { saveAssetHistory } from "./summaries";
import { replaceTransactionsForMonth, saveTransaction } from "./transactions";

const isCI = process.env.CI === "true";
function log(...args: unknown[]) {
  if (!isCI) console.log(...args);
}

function resolveHoldingAccountId(
  accountIdByName: Map<string, number | null>,
  item: { institution: string; name: string },
  fallbackAccountId: number,
): number {
  const institutionAccountId = accountIdByName.get(item.institution);
  if (institutionAccountId != null) return institutionAccountId;

  if (!item.institution) {
    return accountIdByName.get(item.name) ?? fallbackAccountId;
  }

  return fallbackAccountId;
}

/**
 * 「グループ選択なし」用: 全データを保存
 * - アカウント情報
 * - portfolio, liabilities, cashFlow
 * - assetHistory, spendingTargets
 * - group_accountsへのリンク
 */
export async function saveScrapedData(db: Db, data: ScrapedData): Promise<void> {
  await saveScrapedDataBatch(db, { fullData: data, groupOnlyData: [] });
}

export async function saveScrapedDataBatch(
  db: Db,
  data: {
    cleanupGroupIds?: string[];
    fullData?: ScrapedData;
    groupOnlyData: ScrapedData[];
    historyMonths?: Array<{ items: CashFlowItem[]; month: string }>;
    institutionCategories?: ReadonlyMap<string, string>;
  },
): Promise<number[]> {
  return db.transaction(async (transaction) => {
    if (data.fullData) await saveScrapedDataAtomically(transaction, data.fullData);
    for (const groupData of data.groupOnlyData) {
      await saveGroupOnlyDataAtomically(transaction, groupData);
    }
    for (const [mfId, category] of data.institutionCategories ?? []) {
      await updateAccountCategory(transaction, mfId, category);
    }

    const savedCounts: number[] = [];
    if (data.historyMonths?.length) {
      const accountIdMap = await buildAccountIdMap(transaction);
      for (const { items, month } of data.historyMonths) {
        savedCounts.push(
          await replaceTransactionsForMonth(transaction, month, items, accountIdMap),
        );
      }
    }
    if (data.cleanupGroupIds) await deleteGroupsNotIn(transaction, data.cleanupGroupIds);
    return savedCounts;
  });
}

async function saveScrapedDataAtomically(db: DbExecutor, data: ScrapedData): Promise<void> {
  const today = getJstTodayIsoDate();

  log("Saving scraped data to database...");

  // 1. Save group
  if (data.currentGroup) {
    await upsertGroup(db, data.currentGroup);
    log(`  - Group: ${data.currentGroup.name}`);
  }

  const groupId = data.currentGroup?.id;
  if (groupId === undefined || groupId === null) {
    throw new Error("No group available. Cannot save data.");
  }

  // 2. Save accounts (バルク処理)
  await upsertAccounts(db, data.registeredAccounts.accounts);
  log(`  - Accounts: ${data.registeredAccounts.accounts.length}`);

  // 3. Build accountIdMap from DB
  const accountIdMap = await buildAccountIdMap(db);
  log(`  - accountIdMap: ${accountIdMap.size} entries`);

  const currentAccountIdByName = new Map<string, number | null>();
  for (const account of data.registeredAccounts.accounts) {
    const accountId = accountIdMap.get(account.mfId);
    if (accountId === undefined) continue;

    const existingAccountId = currentAccountIdByName.get(account.name);
    if (existingAccountId === undefined) {
      currentAccountIdByName.set(account.name, accountId);
    } else if (existingAccountId !== accountId) {
      currentAccountIdByName.set(account.name, null);
    }
  }

  // 4. Group-account links (バルク処理)
  await clearGroupAccountLinks(db, groupId);
  const accountIds = data.registeredAccounts.accounts
    .map((account) => accountIdMap.get(account.mfId))
    .filter((id): id is number => id !== undefined);
  await linkAccountsToGroup(db, groupId, accountIds);
  log(`  - Group account links: ${accountIds.length}`);

  // 5. Save account statuses (バルク処理)
  const statusRecords = data.registeredAccounts.accounts
    .map((account) => {
      const accountId = accountIdMap.get(account.mfId);
      if (accountId) {
        return { accountId, status: account };
      }
      return null;
    })
    .filter(
      (r): r is { accountId: number; status: (typeof data.registeredAccounts.accounts)[0] } =>
        r !== null,
    );
  await saveAccountStatuses(db, statusRecords);

  // 6. Create snapshot
  const snapshotId = await createSnapshot(db, groupId, today, data.refreshResult);
  log(`  - Snapshot ID: ${snapshotId}`);

  // 7. Unknown account for unmatched items
  let unknownAccount = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.mfId, "unknown"))
    .get();

  if (!unknownAccount) {
    unknownAccount = await db
      .insert(schema.accounts)
      .values({
        mfId: "unknown",
        name: "-",
        type: "手動",
        createdAt: now(),
        updatedAt: now(),
      })
      .returning()
      .get();
  }
  const unknownAccountId = unknownAccount.id;

  // 8. Save portfolio
  for (const item of data.portfolio.items) {
    const accountId = resolveHoldingAccountId(currentAccountIdByName, item, unknownAccountId);
    const categoryId = await getOrCreateCategory(db, item.type);
    const holdingId = await createHolding(db, accountId, item.name, "asset", {
      categoryId,
      code: item.code,
    });
    const amount = Number.isFinite(item.balance) ? item.balance : 0;
    await saveHoldingValue(db, holdingId, snapshotId, {
      amount,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      avgCostPrice: item.avgCostPrice,
      dailyChange: item.dailyChange,
      unrealizedGain: item.unrealizedGain,
      unrealizedGainPct: item.unrealizedGainPct,
    });
  }
  log(`  - Portfolio: ${data.portfolio.items.length}`);

  // 9. Save liabilities
  for (const liability of data.liabilities.items) {
    const accountId = resolveHoldingAccountId(currentAccountIdByName, liability, unknownAccountId);
    const holdingId = await createHolding(db, accountId, liability.name, "liability", {
      liabilityCategory: liability.category,
    });
    await saveHoldingValue(db, holdingId, snapshotId, { amount: liability.balance });
  }
  log(`  - Liabilities: ${data.liabilities.items.length}`);

  // 10. Save transactions
  let savedCount = 0;
  for (const item of data.cashFlow.items) {
    await saveTransaction(db, item, accountIdMap);
    if (item.mfId && !item.mfId.startsWith("unknown")) {
      savedCount++;
    }
  }
  log(`  - Transactions: ${savedCount}/${data.cashFlow.items.length}`);

  // 11. Save asset history
  if (data.assetHistory?.points?.length > 0) {
    await saveAssetHistory(db, groupId, data.assetHistory.points);
    log(`  - Asset history: ${data.assetHistory.points.length}`);
  }

  // 12. Save spending targets
  if (data.spendingTargets) {
    await saveSpendingTargets(db, groupId, data.spendingTargets);
    log(`  - Spending targets: ${data.spendingTargets.categories.length}`);
  }

  // 13. Update timestamp
  await updateGroupLastScrapedAt(db, groupId, now());

  log("Data saved successfully!");
}

/**
 * 各グループ用: グループ固有データのみ保存
 * - group_accountsへのリンク
 * - assetHistory
 * - spendingTargets
 */
export async function saveGroupOnlyData(db: Db, data: ScrapedData): Promise<void> {
  await saveScrapedDataBatch(db, { groupOnlyData: [data] });
}

async function saveGroupOnlyDataAtomically(db: DbExecutor, data: ScrapedData): Promise<void> {
  log("Saving group-only data to database...");

  // 1. Save group
  if (data.currentGroup) {
    await upsertGroup(db, data.currentGroup);
    log(`  - Group: ${data.currentGroup.name}`);
  }

  const groupId = data.currentGroup?.id;
  if (groupId === undefined || groupId === null) {
    throw new Error("No group available. Cannot save data.");
  }

  // 2. Build accountIdMap from DB (全アカウント)
  const accountIdMap = await buildAccountIdMap(db);

  // 3. Group-account links (バルク処理)
  await clearGroupAccountLinks(db, groupId);
  const accountIds = data.registeredAccounts.accounts
    .map((account) => accountIdMap.get(account.mfId))
    .filter((id): id is number => id !== undefined);
  await linkAccountsToGroup(db, groupId, accountIds);
  log(`  - Group account links: ${accountIds.length}`);

  // 4. Save asset history
  if (data.assetHistory?.points?.length > 0) {
    await saveAssetHistory(db, groupId, data.assetHistory.points);
    log(`  - Asset history: ${data.assetHistory.points.length}`);
  }

  // 5. Save spending targets
  if (data.spendingTargets) {
    await saveSpendingTargets(db, groupId, data.spendingTargets);
    log(`  - Spending targets: ${data.spendingTargets.categories.length}`);
  }

  // 6. Update timestamp
  await updateGroupLastScrapedAt(db, groupId, now());

  log("Group data saved successfully!");
}
