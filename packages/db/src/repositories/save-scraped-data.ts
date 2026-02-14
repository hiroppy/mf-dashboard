import { eq } from "drizzle-orm";
import type { Db } from "../index";
import type { ScrapedData } from "../types";
import { schema } from "../index";
import { now } from "../utils";
import { upsertAccounts, saveAccountStatuses, buildAccountIdMap } from "./accounts";
import { getOrCreateCategory } from "./categories";
import {
  upsertGroup,
  updateGroupLastScrapedAt,
  clearGroupAccountLinks,
  linkAccountsToGroup,
} from "./groups";
import { createHolding, saveHoldingValue } from "./holdings";
import { createSnapshot } from "./snapshots";
import { saveSpendingTargets } from "./spending-targets";
import { saveAssetHistory } from "./summaries";
import { saveTransaction } from "./transactions";

const isCI = process.env.CI === "true";
function log(...args: unknown[]) {
  if (!isCI) console.log(...args);
}

/**
 * 「グループ選択なし」用: 全データを保存
 * - アカウント情報
 * - portfolio, liabilities, cashFlow
 * - assetHistory, spendingTargets
 * - group_accountsへのリンク
 */
export async function saveScrapedData(db: Db, data: ScrapedData): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

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
    const accountId = accountIdMap.get(item.institution) || unknownAccountId;
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
    const accountId = accountIdMap.get(liability.institution) || unknownAccountId;
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
