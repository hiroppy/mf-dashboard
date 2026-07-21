import { describe, test, expect, beforeAll, beforeEach, afterAll } from "vitest";
import * as schema from "../schema/schema";
import { createTestDb, resetTestDb, closeTestDb } from "../test-helpers";
import type { CashFlowItem } from "../types";
import {
  saveTransaction,
  hasTransactionsForMonth,
  deleteTransactionsForMonth,
  saveTransactionsForMonth,
  findExistingTransactionMfIds,
} from "./transactions";

type Db = Awaited<ReturnType<typeof createTestDb>>;

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(() => {
  closeTestDb(db);
});

beforeEach(async () => {
  await resetTestDb(db);
});

describe("saveTransaction", () => {
  test("トランザクションを保存できる", async () => {
    const item: CashFlowItem = {
      mfId: "tx1",
      date: "2025-04-15",
      category: "食費",
      subCategory: null,
      description: "テスト",
      amount: 1000,
      type: "expense",
      isTransfer: false,
      isExcludedFromCalculation: false,
    };
    await saveTransaction(db, item);
    const result = await db.select().from(schema.transactions).all();
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(1000);
  });

  test("accountIdMapでaccount_idが設定される", async () => {
    // まずアカウントを作成
    const accountResult = await db
      .insert(schema.accounts)
      .values({
        mfId: "acc1",
        name: "三井住友銀行 (テスト)",
        type: "自動連携",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .returning()
      .get();
    const accountId = accountResult.id;

    const accountIdMap = new Map<string, number>();
    accountIdMap.set("acc1", accountId);
    accountIdMap.set("三井住友銀行 (テスト)", accountId);

    const item: CashFlowItem = {
      mfId: "tx1",
      date: "2025-04-15",
      category: "食費",
      subCategory: null,
      description: "テスト",
      amount: 1000,
      type: "expense",
      isTransfer: false,
      isExcludedFromCalculation: false,
      accountName: "三井住友銀行 (テスト)",
    };
    await saveTransaction(db, item, accountIdMap);

    const result = await db.select().from(schema.transactions).all();
    expect(result).toHaveLength(1);
    expect(result[0].accountId).toBe(accountId);
  });

  test("accountIdMapで部分一致でaccount_idが設定される", async () => {
    // まずアカウントを作成
    const accountResult = await db
      .insert(schema.accounts)
      .values({
        mfId: "acc1",
        name: "三井住友銀行 (テスト)",
        type: "自動連携",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .returning()
      .get();
    const accountId = accountResult.id;

    const accountIdMap = new Map<string, number>();
    accountIdMap.set("acc1", accountId);
    accountIdMap.set("三井住友銀行 (テスト)", accountId);

    const item: CashFlowItem = {
      mfId: "tx1",
      date: "2025-04-15",
      category: "食費",
      subCategory: null,
      description: "テスト",
      amount: 1000,
      type: "expense",
      isTransfer: false,
      isExcludedFromCalculation: false,
      accountName: "三井住友銀行", // 部分一致
    };
    await saveTransaction(db, item, accountIdMap);

    const result = await db.select().from(schema.transactions).all();
    expect(result).toHaveLength(1);
    expect(result[0].accountId).toBe(accountId);
  });

  test("振替トランザクションでtransferTargetAccountIdが設定される", async () => {
    // 送金元アカウントを作成
    const sourceResult = await db
      .insert(schema.accounts)
      .values({
        mfId: "acc1",
        name: "ゆうちょ銀行（貯蓄用）",
        type: "自動連携",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .returning()
      .get();
    const sourceAccountId = sourceResult.id;

    // 送金先アカウントを作成
    const targetResult = await db
      .insert(schema.accounts)
      .values({
        mfId: "acc2",
        name: "三井住友銀行 (テスト)",
        type: "自動連携",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .returning()
      .get();
    const targetAccountId = targetResult.id;

    const accountIdMap = new Map<string, number>();
    accountIdMap.set("ゆうちょ銀行（貯蓄用）", sourceAccountId);
    accountIdMap.set("三井住友銀行 (テスト)", targetAccountId);

    const item: CashFlowItem = {
      mfId: "tx1",
      date: "2025-04-15",
      category: null,
      subCategory: null,
      description: "振替",
      amount: 100000,
      type: "transfer",
      isTransfer: true,
      isExcludedFromCalculation: true,
      accountName: "三井住友銀行 (テスト)", // トランザクションの所有者
      transferTarget: "ゆうちょ銀行（貯蓄用）", // 振替相手先
    };
    await saveTransaction(db, item, accountIdMap);

    const result = await db.select().from(schema.transactions).all();
    expect(result).toHaveLength(1);
    expect(result[0].accountId).toBe(targetAccountId);
    expect(result[0].transferTargetAccountId).toBe(sourceAccountId);
  });

  test("振替トランザクションでtransferTargetが部分一致でも解決される", async () => {
    // 送金元アカウントを作成（フルネーム）
    const sourceResult = await db
      .insert(schema.accounts)
      .values({
        mfId: "acc1",
        name: "ゆうちょ銀行（貯蓄用）",
        type: "自動連携",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .returning()
      .get();
    const sourceAccountId = sourceResult.id;

    // 送金先アカウントを作成
    const targetResult = await db
      .insert(schema.accounts)
      .values({
        mfId: "acc2",
        name: "三井住友銀行",
        type: "自動連携",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .returning()
      .get();
    const targetAccountId = targetResult.id;

    const accountIdMap = new Map<string, number>();
    accountIdMap.set("ゆうちょ銀行（貯蓄用）", sourceAccountId);
    accountIdMap.set("三井住友銀行", targetAccountId);

    const item: CashFlowItem = {
      mfId: "tx1",
      date: "2025-04-15",
      category: null,
      subCategory: null,
      description: "振替",
      amount: 100000,
      type: "transfer",
      isTransfer: true,
      isExcludedFromCalculation: true,
      accountName: "三井住友銀行",
      transferTarget: "ゆうちょ銀行", // 部分一致
    };
    await saveTransaction(db, item, accountIdMap);

    const result = await db.select().from(schema.transactions).all();
    expect(result).toHaveLength(1);
    expect(result[0].transferTargetAccountId).toBe(sourceAccountId);
  });

  test("振替トランザクションでtransferTargetがマッチしない場合はnull", async () => {
    const accountResult = await db
      .insert(schema.accounts)
      .values({
        mfId: "acc1",
        name: "三井住友銀行",
        type: "自動連携",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .returning()
      .get();
    const accountId = accountResult.id;

    const accountIdMap = new Map<string, number>();
    accountIdMap.set("三井住友銀行", accountId);

    const item: CashFlowItem = {
      mfId: "tx1",
      date: "2025-04-15",
      category: null,
      subCategory: null,
      description: "振替",
      amount: 100000,
      type: "transfer",
      isTransfer: true,
      isExcludedFromCalculation: true,
      accountName: "三井住友銀行",
      transferTarget: "存在しない銀行",
    };
    await saveTransaction(db, item, accountIdMap);

    const result = await db.select().from(schema.transactions).all();
    expect(result).toHaveLength(1);
    expect(result[0].accountId).toBe(accountId);
    expect(result[0].transferTargetAccountId).toBeNull();
  });

  test("accountIdMapがない場合はaccount_idがnull", async () => {
    const item: CashFlowItem = {
      mfId: "tx1",
      date: "2025-04-15",
      category: "食費",
      subCategory: null,
      description: "テスト",
      amount: 1000,
      type: "expense",
      isTransfer: false,
      isExcludedFromCalculation: false,
      accountName: "三井住友銀行",
    };
    await saveTransaction(db, item);

    const result = await db.select().from(schema.transactions).all();
    expect(result).toHaveLength(1);
    expect(result[0].accountId).toBeNull();
  });

  test("unknown mfId はスキップされる", async () => {
    const item: CashFlowItem = {
      mfId: "unknown-1",
      date: "2025-04-15",
      category: "食費",
      subCategory: null,
      description: "テスト",
      amount: 1000,
      type: "expense",
      isTransfer: false,
      isExcludedFromCalculation: false,
    };
    await saveTransaction(db, item);
    const result = await db.select().from(schema.transactions).all();
    expect(result).toHaveLength(0);
  });

  test("同じ mfId で upsert される", async () => {
    const item: CashFlowItem = {
      mfId: "tx1",
      date: "2025-04-15",
      category: "食費",
      subCategory: null,
      description: "テスト",
      amount: 1000,
      type: "expense",
      isTransfer: false,
      isExcludedFromCalculation: false,
    };
    await saveTransaction(db, item);
    await saveTransaction(db, { ...item, amount: 2000 });
    const result = await db.select().from(schema.transactions).all();
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(2000);
  });

  test("同じ mfId でカテゴリや詳細が変更されたら反映される", async () => {
    const item: CashFlowItem = {
      mfId: "tx1",
      date: "2025-04-15",
      category: "食費",
      subCategory: "食料品",
      description: "スーパー",
      amount: 3000,
      type: "expense",
      isTransfer: false,
      isExcludedFromCalculation: false,
    };
    await saveTransaction(db, item);

    await saveTransaction(db, {
      ...item,
      category: "日用品",
      subCategory: "ドラッグストア",
      description: "薬局",
      amount: 5000,
      type: "expense",
      isExcludedFromCalculation: true,
    });

    const result = await db.select().from(schema.transactions).all();
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("日用品");
    expect(result[0].subCategory).toBe("ドラッグストア");
    expect(result[0].description).toBe("薬局");
    expect(result[0].amount).toBe(5000);
    expect(result[0].isExcludedFromCalculation).toBe(true);
  });
});

describe("findExistingTransactionMfIds", () => {
  test("指定したmfIdのうちDBに存在するものだけをSetで返す", async () => {
    await saveTransaction(db, {
      mfId: "existing-1",
      date: "2026-06-01",
      category: "食費",
      subCategory: "食料品",
      description: "Test Transaction A",
      amount: 1000,
      type: "expense",
      isTransfer: false,
      isExcludedFromCalculation: false,
    });
    await saveTransaction(db, {
      mfId: "existing-2",
      date: "2026-06-02",
      category: "趣味・娯楽",
      subCategory: "動画・音楽",
      description: "Test Transaction B",
      amount: 2000,
      type: "expense",
      isTransfer: false,
      isExcludedFromCalculation: false,
    });

    const result = await findExistingTransactionMfIds(db, ["existing-1", "missing", "existing-2"]);

    expect([...result].sort()).toEqual(["existing-1", "existing-2"]);
  });

  test("空配列の場合はDBを読まず空Setを返す", async () => {
    const result = await findExistingTransactionMfIds(db, []);

    expect(result).toEqual(new Set());
  });

  test("BATCH_SIZEを超える入力でも全バッチの既存mfIdを返す", async () => {
    for (const mfId of ["existing-1", "existing-2", "existing-599"]) {
      await saveTransaction(db, {
        mfId,
        date: "2026-06-03",
        category: "食費",
        subCategory: null,
        description: `Batch Edge ${mfId}`,
        amount: 100,
        type: "expense",
        isTransfer: false,
        isExcludedFromCalculation: false,
      });
    }

    const mfIds = Array.from({ length: 600 }, (_, index) => `missing-${index}`);
    mfIds[0] = "existing-1";
    mfIds[499] = "existing-2";
    mfIds[599] = "existing-599";

    const result = await findExistingTransactionMfIds(db, mfIds);

    expect([...result].sort()).toEqual(["existing-1", "existing-2", "existing-599"]);
  });
});

describe("hasTransactionsForMonth / deleteTransactionsForMonth", () => {
  test("月にデータがなければ false", async () => {
    expect(await hasTransactionsForMonth(db, "2025-04")).toBe(false);
  });

  test("月にデータがあれば true", async () => {
    await saveTransaction(db, {
      mfId: "tx1",
      date: "2025-04-15",
      category: "食費",
      subCategory: null,
      description: "テスト",
      amount: 1000,
      type: "expense",
      isTransfer: false,
      isExcludedFromCalculation: false,
    });
    expect(await hasTransactionsForMonth(db, "2025-04")).toBe(true);
  });

  test("月のデータを削除できる", async () => {
    await saveTransaction(db, {
      mfId: "tx1",
      date: "2025-04-15",
      category: "食費",
      subCategory: null,
      description: "テスト",
      amount: 1000,
      type: "expense",
      isTransfer: false,
      isExcludedFromCalculation: false,
    });
    const count = await deleteTransactionsForMonth(db, "2025-04");
    expect(count).toBe(1);
    expect(await hasTransactionsForMonth(db, "2025-04")).toBe(false);
  });
});

describe("saveTransactionsForMonth", () => {
  const items: CashFlowItem[] = [
    {
      mfId: "tx1",
      date: "2025-04-10",
      category: "食費",
      subCategory: null,
      description: "スーパー",
      amount: 3000,
      type: "expense",
      isTransfer: false,
      isExcludedFromCalculation: false,
    },
    {
      mfId: "tx2",
      date: "2025-04-15",
      category: "給与",
      subCategory: null,
      description: "給料",
      amount: 300000,
      type: "income",
      isTransfer: false,
      isExcludedFromCalculation: false,
    },
  ];

  test("月のトランザクションを一括保存できる", async () => {
    const savedCount = await saveTransactionsForMonth(db, "2025-04", items);
    expect(savedCount).toBe(2);
  });

  test("既存データは削除して上書きされる", async () => {
    await saveTransactionsForMonth(db, "2025-04", items);

    // 異なるデータで上書き
    const newItems: CashFlowItem[] = [
      {
        mfId: "tx3",
        date: "2025-04-20",
        category: "交通費",
        subCategory: null,
        description: "電車代",
        amount: 500,
        type: "expense",
        isTransfer: false,
        isExcludedFromCalculation: false,
      },
    ];
    const savedCount = await saveTransactionsForMonth(db, "2025-04", newItems);

    expect(savedCount).toBe(1);
    const result = await db.select().from(schema.transactions).all();
    expect(result).toHaveLength(1);
    expect(result[0].mfId).toBe("tx3");
  });

  test("MM/DD形式の日付は保存対象月の年で保存される", async () => {
    const savedCount = await saveTransactionsForMonth(db, "2025-12", [
      {
        mfId: "tx-history-1",
        date: "12/31",
        category: "食費",
        subCategory: null,
        description: "スーパー",
        amount: 3000,
        type: "expense",
        isTransfer: false,
        isExcludedFromCalculation: false,
      },
    ]);

    expect(savedCount).toBe(1);
    const result = await db.select().from(schema.transactions).all();
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2025-12-31");
  });
});
