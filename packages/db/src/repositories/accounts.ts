import { eq, sql } from "drizzle-orm";
import type { Db } from "../index";
import type { AccountStatus } from "../types";
import { schema } from "../index";
import { now, convertToIsoDate, upsertById } from "../utils";
import { getOrCreateInstitutionCategory } from "./institution-categories";

const BATCH_SIZE = 500;

export async function upsertAccount(db: Db, account: AccountStatus): Promise<number> {
  // URLからmfIdを抽出（例: /accounts/show/0T1oiWJN9GM... -> 0T1oiWJN9GM...）
  const mfId = account.mfId || account.name;

  return await upsertById(
    db,
    schema.accounts,
    eq(schema.accounts.mfId, mfId),
    {
      mfId,
      name: account.name,
      type: account.type,
      institution: account.name,
      isActive: true,
    },
    {
      name: account.name,
      type: account.type,
      isActive: true,
    },
  );
}

export async function saveAccountStatus(
  db: Db,
  accountId: number,
  status: AccountStatus,
): Promise<void> {
  // lastUpdated を ISO形式に変換
  const isoLastUpdated = convertToIsoDate(status.lastUpdated);

  const data = {
    accountId,
    status: status.status,
    lastUpdated: isoLastUpdated,
    totalAssets: status.totalAssets ?? 0,
    errorMessage: status.errorMessage ?? null,
  };

  await upsertById(
    db,
    schema.accountStatuses,
    eq(schema.accountStatuses.accountId, accountId),
    data,
    data,
  );
}

export async function updateAccountCategory(
  db: Db,
  mfId: string,
  categoryName: string,
): Promise<void> {
  const categoryId = await getOrCreateInstitutionCategory(db, categoryName);

  await db
    .update(schema.accounts)
    .set({ categoryId, updatedAt: now() })
    .where(eq(schema.accounts.mfId, mfId))
    .run();
}

/**
 * 全アカウントのname/mfIdからidへのマップを構築
 * トランザクション保存時のaccount_idルックアップ用
 */
export async function buildAccountIdMap(db: Db): Promise<Map<string, number>> {
  const accounts = await db.select().from(schema.accounts).all();
  const map = new Map<string, number>();

  for (const account of accounts) {
    map.set(account.mfId, account.id);
    map.set(account.name, account.id);
  }

  return map;
}

/**
 * 複数アカウントの一括upsert
 */
export async function upsertAccounts(db: Db, accounts: AccountStatus[]): Promise<void> {
  if (accounts.length === 0) return;

  const timestamp = now();

  for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
    const batch = accounts.slice(i, i + BATCH_SIZE);
    const records = batch.map((account) => {
      const mfId = account.mfId || account.name;
      return {
        mfId,
        name: account.name,
        type: account.type,
        institution: account.name,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    });

    await db
      .insert(schema.accounts)
      .values(records)
      .onConflictDoUpdate({
        target: schema.accounts.mfId,
        set: {
          name: sql`excluded.name`,
          type: sql`excluded.type`,
          isActive: sql`excluded.is_active`,
          updatedAt: timestamp,
        },
      })
      .run();
  }
}

/**
 * 複数アカウントステータスの一括upsert
 */
export async function saveAccountStatuses(
  db: Db,
  statuses: Array<{ accountId: number; status: AccountStatus }>,
): Promise<void> {
  if (statuses.length === 0) return;

  const timestamp = now();

  for (let i = 0; i < statuses.length; i += BATCH_SIZE) {
    const batch = statuses.slice(i, i + BATCH_SIZE);
    const records = batch.map(({ accountId, status }) => {
      const isoLastUpdated = convertToIsoDate(status.lastUpdated);
      return {
        accountId,
        status: status.status,
        lastUpdated: isoLastUpdated,
        totalAssets: status.totalAssets ?? 0,
        errorMessage: status.errorMessage ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    });

    await db
      .insert(schema.accountStatuses)
      .values(records)
      .onConflictDoUpdate({
        target: schema.accountStatuses.accountId,
        set: {
          status: sql`excluded.status`,
          lastUpdated: sql`excluded.last_updated`,
          totalAssets: sql`excluded.total_assets`,
          errorMessage: sql`excluded.error_message`,
          updatedAt: timestamp,
        },
      })
      .run();
  }
}
