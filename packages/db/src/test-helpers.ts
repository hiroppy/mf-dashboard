import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { join } from "node:path";
import type { Db } from "./index";
import * as schema from "./schema/schema";

/**
 * テスト用のインメモリ DB を作成し、マイグレーションを適用して返す。
 * beforeAll で1回だけ呼び出し、テスト間は resetTestDb でデータをクリアする。
 */
export function createTestDb(): Db {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema });

  // マイグレーション適用
  migrate(db, {
    migrationsFolder: join(import.meta.dirname, "../drizzle"),
  });

  return db;
}

/**
 * 全テーブルのデータをクリアする。
 * beforeEach で呼び出してテスト間の分離を保証する。
 */
export async function resetTestDb(db: Db): Promise<void> {
  // FK の依存順に削除
  await db.delete(schema.holdingValues).run();
  await db.delete(schema.dailySnapshots).run();
  await db.delete(schema.holdings).run();
  await db.delete(schema.accountStatuses).run();
  await db.delete(schema.transactions).run();
  await db.delete(schema.assetHistoryCategories).run();
  await db.delete(schema.assetHistory).run();
  await db.delete(schema.spendingTargets).run();
  await db.delete(schema.groupAccounts).run();
  await db.delete(schema.accounts).run();
  await db.delete(schema.groups).run();
  await db.delete(schema.assetCategories).run();
  await db.delete(schema.institutionCategories).run();
}

/** テスト用グループ ID */
export const TEST_GROUP_ID = "test_group_001";

/**
 * テスト用グループを作成する。
 */
export async function createTestGroup(db: Db): Promise<string> {
  const now = new Date().toISOString();
  await db
    .insert(schema.groups)
    .values({
      id: TEST_GROUP_ID,
      name: "Test Group",
      isCurrent: true,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return TEST_GROUP_ID;
}

/**
 * テスト用 DB の接続を閉じる。afterAll で呼び出す。
 */
export function closeTestDb(db: Db): void {
  (db as unknown as { $client: Database.Database }).$client.close();
}
