import { existsSync } from "node:fs";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
/**
 * デモデータ整合性テスト
 *
 * demo.dbの生成後に実行し、データの整合性を確認する。
 * - グループとアカウントの紐付け
 * - 振替トランザクションのtransferTargetAccountId
 * - 資産合計の整合性
 * - グループ外振替の検出
 */
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import * as schema from "./schema/schema";

const dbPath = join(import.meta.dirname, "..", "..", "..", "data", "demo.db");

// demo.dbが存在しない場合はスキップ
const demoDbExists = existsSync(dbPath);
if (!demoDbExists && process.env.REQUIRE_DEMO_DB === "true") {
  throw new Error(`demo.dbが存在しません。先にbuild:demoを実行してください: ${dbPath}`);
}

describe.skipIf(!demoDbExists)("demo.db 整合性テスト", () => {
  let client: Client;
  let db: ReturnType<typeof drizzle>;

  beforeAll(() => {
    client = createClient({ url: `file:${dbPath}` });
    db = drizzle(client, { schema });
  });

  afterAll(() => {
    client?.close();
  });

  describe("グループ構成", () => {
    test("3つのグループが存在する", async () => {
      const groups = await db.select().from(schema.groups).all();
      expect(groups).toHaveLength(3);

      const names = groups.map((g) => g.name);
      expect(names).toContain("グループ選択なし");
      expect(names).toContain("投資");
      expect(names).toContain("生活");
    });

    test("グループ選択なしがisCurrent=trueである", async () => {
      const currentGroup = await db
        .select()
        .from(schema.groups)
        .where(eq(schema.groups.isCurrent, true))
        .get();
      expect(currentGroup).toBeDefined();
      expect(currentGroup?.name).toBe("グループ選択なし");
    });

    test("全アカウントがグループ選択なしに所属している", async () => {
      const allAccounts = await db.select().from(schema.accounts).all();
      const noGroup = await db
        .select()
        .from(schema.groups)
        .where(eq(schema.groups.name, "グループ選択なし"))
        .get();

      const groupAccountIds = (
        await db
          .select({ accountId: schema.groupAccounts.accountId })
          .from(schema.groupAccounts)
          .where(eq(schema.groupAccounts.groupId, noGroup!.id))
          .all()
      ).map((ga) => ga.accountId);

      for (const acc of allAccounts) {
        expect(groupAccountIds).toContain(acc.id);
      }
    });
  });

  describe("振替トランザクション", () => {
    test("振替トランザクションにtransferTargetAccountIdが設定されている", async () => {
      const transfers = await db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.isTransfer, true))
        .all();

      expect(transfers.length).toBeGreaterThan(0);

      // transferTargetがあるものはtransferTargetAccountIdも設定されているべき
      const withTarget = transfers.filter((t) => t.transferTarget !== null);
      for (const t of withTarget) {
        expect(t.transferTargetAccountId).not.toBeNull();
      }
    });

    test("transferTargetAccountIdは有効なアカウントIDである", async () => {
      const transfers = await db
        .select()
        .from(schema.transactions)
        .where(
          and(
            eq(schema.transactions.isTransfer, true),
            isNotNull(schema.transactions.transferTargetAccountId),
          ),
        )
        .all();

      const accountIds = (
        await db.select({ id: schema.accounts.id }).from(schema.accounts).all()
      ).map((a) => a.id);

      for (const t of transfers) {
        expect(accountIds).toContain(t.transferTargetAccountId);
      }
    });

    test("ゆうちょ銀行からの振替が存在する", async () => {
      // ゆうちょ銀行（貯蓄用）のIDを取得
      const yuchoAccount = await db
        .select()
        .from(schema.accounts)
        .where(sql`${schema.accounts.name} LIKE '%ゆうちょ銀行%'`)
        .get();

      expect(yuchoAccount).toBeDefined();

      // ゆうちょ銀行（account_id）からの振替を検索
      const transfersFromYucho = await db
        .select()
        .from(schema.transactions)
        .where(
          and(
            eq(schema.transactions.isTransfer, true),
            eq(schema.transactions.accountId, yuchoAccount!.id),
          ),
        )
        .all();

      expect(transfersFromYucho.length).toBeGreaterThan(0);
    });
  });

  describe("グループ外振替（収入変換対象）", () => {
    test("生活グループにはゆうちょ銀行が含まれない", async () => {
      const livingGroup = await db
        .select()
        .from(schema.groups)
        .where(eq(schema.groups.name, "生活"))
        .get();

      expect(livingGroup).toBeDefined();

      const livingAccountIds = (
        await db
          .select({ accountId: schema.groupAccounts.accountId })
          .from(schema.groupAccounts)
          .where(eq(schema.groupAccounts.groupId, livingGroup!.id))
          .all()
      ).map((ga) => ga.accountId);

      const yuchoAccount = await db
        .select()
        .from(schema.accounts)
        .where(sql`${schema.accounts.name} LIKE '%ゆうちょ銀行%'`)
        .get();

      expect(yuchoAccount).toBeDefined();
      expect(livingAccountIds).not.toContain(yuchoAccount!.id);
    });

    test("生活グループ視点でグループ外振替が存在する", async () => {
      const livingGroup = await db
        .select()
        .from(schema.groups)
        .where(eq(schema.groups.name, "生活"))
        .get();
      expect(livingGroup).toBeDefined();

      const livingAccountIds = new Set(
        (
          await db
            .select({ accountId: schema.groupAccounts.accountId })
            .from(schema.groupAccounts)
            .where(eq(schema.groupAccounts.groupId, livingGroup!.id))
            .all()
        ).map((ga) => ga.accountId),
      );

      // 生活グループ内のアカウントに紐づく振替で、transferTargetがグループ外のもの
      const transfers = await db
        .select()
        .from(schema.transactions)
        .where(
          and(
            eq(schema.transactions.isTransfer, true),
            isNotNull(schema.transactions.transferTargetAccountId),
          ),
        )
        .all();

      const outsideGroupTransfers = transfers.filter((t) => {
        const isAccountInGroup = livingAccountIds.has(t.accountId!);
        const isTargetOutsideGroup = !livingAccountIds.has(t.transferTargetAccountId!);
        return isAccountInGroup && isTargetOutsideGroup;
      });

      expect(outsideGroupTransfers.length).toBeGreaterThan(0);
    });
  });

  describe("資産整合性", () => {
    test("外部キー参照に不整合がない", async () => {
      const result = await client.execute("PRAGMA foreign_key_check");
      expect(result.rows).toHaveLength(0);
    });

    test("資産履歴はスナップショット日を超えず、同日の合計と一致する", async () => {
      const snapshot = await db
        .select()
        .from(schema.dailySnapshots)
        .orderBy(sql`${schema.dailySnapshots.date} DESC`)
        .limit(1)
        .get();
      expect(snapshot).toBeDefined();

      const futureHistory = await db
        .select({ id: schema.assetHistory.id })
        .from(schema.assetHistory)
        .where(sql`${schema.assetHistory.date} > ${snapshot!.date}`)
        .all();
      expect(futureHistory).toHaveLength(0);

      const history = await db
        .select()
        .from(schema.assetHistory)
        .where(
          and(
            eq(schema.assetHistory.groupId, snapshot!.groupId),
            eq(schema.assetHistory.date, snapshot!.date),
          ),
        )
        .get();
      const assetTotal = await db
        .select({ total: sql<number>`SUM(${schema.holdingValues.amount})` })
        .from(schema.holdingValues)
        .innerJoin(schema.holdings, eq(schema.holdingValues.holdingId, schema.holdings.id))
        .where(
          and(eq(schema.holdingValues.snapshotId, snapshot!.id), eq(schema.holdings.type, "asset")),
        )
        .get();

      expect(history?.totalAssets).toBe(assetTotal?.total);
    });

    test("含み益と含み損の保有資産が存在する", async () => {
      const gains = (
        await db
          .select({ unrealizedGain: schema.holdingValues.unrealizedGain })
          .from(schema.holdingValues)
          .where(isNotNull(schema.holdingValues.unrealizedGain))
          .all()
      ).map(({ unrealizedGain }) => unrealizedGain!);

      expect(gains.some((gain) => gain > 0)).toBe(true);
      expect(gains.some((gain) => gain < 0)).toBe(true);
    });

    test("暗号資産アカウントと保有資産が存在する", async () => {
      const cryptoAccounts = await db
        .select({ id: schema.accounts.id, name: schema.accounts.name })
        .from(schema.accounts)
        .innerJoin(
          schema.institutionCategories,
          eq(schema.accounts.categoryId, schema.institutionCategories.id),
        )
        .where(eq(schema.institutionCategories.name, "暗号資産・FX・貴金属"))
        .all();

      expect(cryptoAccounts.length).toBeGreaterThan(0);

      const cryptoHoldings = await db
        .select({
          name: schema.holdings.name,
          amount: schema.holdingValues.amount,
        })
        .from(schema.holdings)
        .innerJoin(
          schema.assetCategories,
          eq(schema.holdings.categoryId, schema.assetCategories.id),
        )
        .innerJoin(schema.holdingValues, eq(schema.holdings.id, schema.holdingValues.holdingId))
        .where(eq(schema.assetCategories.name, "暗号資産"))
        .all();

      expect(cryptoHoldings.length).toBeGreaterThan(0);
      expect(cryptoHoldings.reduce((sum, h) => sum + h.amount, 0)).toBeGreaterThan(0);
    });

    test("最新の資産履歴に暗号資産カテゴリが含まれる", async () => {
      const targetGroups = await db
        .select()
        .from(schema.groups)
        .where(sql`${schema.groups.name} IN ('グループ選択なし', '投資')`)
        .all();

      expect(targetGroups).toHaveLength(2);

      for (const group of targetGroups) {
        const latestAssetHistory = await db
          .select()
          .from(schema.assetHistory)
          .where(eq(schema.assetHistory.groupId, group.id))
          .orderBy(sql`${schema.assetHistory.date} DESC`)
          .limit(1)
          .get();

        expect(latestAssetHistory).toBeDefined();

        const cryptoCategory = await db
          .select()
          .from(schema.assetHistoryCategories)
          .where(
            and(
              eq(schema.assetHistoryCategories.assetHistoryId, latestAssetHistory!.id),
              eq(schema.assetHistoryCategories.categoryName, "暗号資産"),
            ),
          )
          .get();

        expect(cryptoCategory?.amount).toBeGreaterThan(0);
      }
    });

    test("holdingValuesの合計がassetHistoryの最終日と一致する", async () => {
      const groups = await db.select().from(schema.groups).all();

      for (const group of groups) {
        // グループの最新スナップショットを取得
        const snapshot = await db
          .select()
          .from(schema.dailySnapshots)
          .where(eq(schema.dailySnapshots.groupId, group.id))
          .orderBy(sql`${schema.dailySnapshots.date} DESC`)
          .limit(1)
          .get();

        if (!snapshot) continue;

        // holdingValuesの合計
        const holdingTotal = await db
          .select({ total: sql<number>`SUM(${schema.holdingValues.amount})` })
          .from(schema.holdingValues)
          .innerJoin(schema.holdings, eq(schema.holdingValues.holdingId, schema.holdings.id))
          .where(eq(schema.holdingValues.snapshotId, snapshot.id))
          .get();

        // assetHistoryの最終日
        const latestAssetHistory = await db
          .select()
          .from(schema.assetHistory)
          .where(eq(schema.assetHistory.groupId, group.id))
          .orderBy(sql`${schema.assetHistory.date} DESC`)
          .limit(1)
          .get();

        // 資産のみの合計を比較（負債は除く）
        const assetHoldingTotal = await db
          .select({ total: sql<number>`SUM(${schema.holdingValues.amount})` })
          .from(schema.holdingValues)
          .innerJoin(schema.holdings, eq(schema.holdingValues.holdingId, schema.holdings.id))
          .where(
            and(
              eq(schema.holdingValues.snapshotId, snapshot.id),
              eq(schema.holdings.type, "asset"),
            ),
          )
          .get();

        expect(holdingTotal?.total).toBeDefined();
        expect(latestAssetHistory).toBeDefined();
        expect(assetHoldingTotal?.total).toBe(latestAssetHistory?.totalAssets);
      }
    });

    test("資産履歴のカテゴリ合計が日次合計と一致する", async () => {
      const mismatches = await db
        .select({ id: schema.assetHistory.id })
        .from(schema.assetHistory)
        .leftJoin(
          schema.assetHistoryCategories,
          eq(schema.assetHistoryCategories.assetHistoryId, schema.assetHistory.id),
        )
        .groupBy(schema.assetHistory.id)
        .having(
          sql`COALESCE(SUM(${schema.assetHistoryCategories.amount}), 0) <> ${schema.assetHistory.totalAssets}`,
        )
        .all();

      expect(mismatches).toHaveLength(0);
    });

    test("資産履歴のchangeが同じグループの前日差分と一致する", async () => {
      const result = await client.execute(`
        SELECT id
        FROM (
          SELECT
            id,
            total_assets,
            change,
            LAG(total_assets) OVER (PARTITION BY group_id ORDER BY date) AS previous_total
          FROM asset_history
        )
        WHERE change <> CASE
          WHEN previous_total IS NULL THEN 0
          ELSE total_assets - previous_total
        END
      `);

      expect(result.rows).toHaveLength(0);
    });

    test("アカウントごとのholdingが存在する", async () => {
      const accounts = await db.select().from(schema.accounts).all();

      // 携帯・通販など取引のみで資産を持たないアカウントは除外
      const accountsWithExpectedHoldings = accounts.filter(
        (a) => !["ahamo", "Amazon.co.jp"].includes(a.name),
      );

      for (const acc of accountsWithExpectedHoldings) {
        const holdings = await db
          .select()
          .from(schema.holdings)
          .where(eq(schema.holdings.accountId, acc.id))
          .all();

        expect(holdings.length).toBeGreaterThan(0);
      }
    });
  });

  describe("トランザクション整合性", () => {
    test("収入・支出トランザクションにカテゴリが設定されている", async () => {
      const incomeExpense = await db
        .select()
        .from(schema.transactions)
        .where(sql`${schema.transactions.type} IN ('income', 'expense')`)
        .all();

      for (const tx of incomeExpense) {
        expect(tx.category).not.toBeNull();
      }
    });

    test("振替トランザクションはisExcludedFromCalculation=trueである", async () => {
      const transfers = await db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.type, "transfer"))
        .all();

      for (const tx of transfers) {
        expect(tx.isExcludedFromCalculation).toBe(true);
      }
    });

    test("月次データが連続している", async () => {
      const months = (
        await db
          .select({ month: sql<string>`SUBSTR(${schema.transactions.date}, 1, 7)` })
          .from(schema.transactions)
          .groupBy(sql`SUBSTR(${schema.transactions.date}, 1, 7)`)
          .orderBy(sql`SUBSTR(${schema.transactions.date}, 1, 7)`)
          .all()
      ).map((m) => m.month);

      expect(months.length).toBeGreaterThan(0);

      // 月が連続しているか確認
      for (let i = 1; i < months.length; i++) {
        const prev = new Date(`${months[i - 1]}-01`);
        const curr = new Date(`${months[i]}-01`);

        // 次の月か確認
        prev.setMonth(prev.getMonth() + 1);
        expect(prev.toISOString().slice(0, 7)).toBe(curr.toISOString().slice(0, 7));
      }
    });
  });

  describe("予算設定", () => {
    test("生活グループとグループ選択なしに予算が設定されている", async () => {
      const groups = await db
        .select()
        .from(schema.groups)
        .where(sql`${schema.groups.name} IN ('グループ選択なし', '生活')`)
        .all();

      for (const group of groups) {
        const targets = await db
          .select()
          .from(schema.spendingTargets)
          .where(eq(schema.spendingTargets.groupId, group.id))
          .all();

        expect(targets.length).toBeGreaterThan(0);
      }
    });

    test("投資グループには予算が設定されていない", async () => {
      const investmentGroup = await db
        .select()
        .from(schema.groups)
        .where(eq(schema.groups.name, "投資"))
        .get();

      expect(investmentGroup).toBeDefined();

      const targets = await db
        .select()
        .from(schema.spendingTargets)
        .where(eq(schema.spendingTargets.groupId, investmentGroup!.id))
        .all();

      expect(targets).toHaveLength(0);
    });
  });
});
