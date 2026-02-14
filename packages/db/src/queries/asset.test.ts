import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { schema } from "../index";
import {
  createTestDb,
  resetTestDb,
  closeTestDb,
  TEST_GROUP_ID,
  createTestGroup,
} from "../test-helpers";
import {
  parseDateString,
  toDateString,
  calculateTargetDate,
  getAssetBreakdownByCategory,
  getLiabilityBreakdownByCategory,
  getAssetHistory,
  getAssetHistoryWithCategories,
  getLatestTotalAssets,
  getDailyAssetChange,
  getCategoryChangesForPeriod,
  aggregateLiabilitiesByCategory,
  calculateCategoryChanges,
} from "./asset";

type Db = ReturnType<typeof createTestDb>;
let db: Db;

beforeAll(() => {
  db = createTestDb();
});

afterAll(() => {
  closeTestDb(db);
});

beforeEach(async () => {
  await resetTestDb(db);
  await createTestGroup(db);
});

async function createAssetHistory(data: { date: string; totalAssets: number }): Promise<number> {
  const now = new Date().toISOString();
  const history = await db
    .insert(schema.assetHistory)
    .values({
      groupId: TEST_GROUP_ID,
      date: data.date,
      totalAssets: data.totalAssets,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return history.id;
}

async function createAssetHistoryCategory(data: {
  assetHistoryId: number;
  categoryName: string;
  amount: number;
}) {
  const now = new Date().toISOString();
  await db
    .insert(schema.assetHistoryCategories)
    .values({
      assetHistoryId: data.assetHistoryId,
      categoryName: data.categoryName,
      amount: data.amount,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

async function createTestAccount(name: string): Promise<number> {
  const now = new Date().toISOString();
  const account = await db
    .insert(schema.accounts)
    .values({
      mfId: `mf_${name}`,
      name,
      type: "bank",
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  await db
    .insert(schema.groupAccounts)
    .values({
      groupId: TEST_GROUP_ID,
      accountId: account.id,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return account.id;
}

async function createSnapshot(): Promise<number> {
  const now = new Date().toISOString();
  const snapshot = await db
    .insert(schema.dailySnapshots)
    .values({
      groupId: TEST_GROUP_ID,
      date: "2025-04-15",
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return snapshot.id;
}

async function createHolding(data: {
  accountId: number;
  name: string;
  type?: "asset" | "liability";
  liabilityCategory?: string | null;
}): Promise<number> {
  const now = new Date().toISOString();
  const holding = await db
    .insert(schema.holdings)
    .values({
      accountId: data.accountId,
      name: data.name,
      type: data.type ?? "asset",
      liabilityCategory: data.liabilityCategory ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return holding.id;
}

async function createHoldingValue(data: { holdingId: number; snapshotId: number; amount: number }) {
  const now = new Date().toISOString();
  await db
    .insert(schema.holdingValues)
    .values({
      holdingId: data.holdingId,
      snapshotId: data.snapshotId,
      amount: data.amount,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

// ============================================================
// 内部関数のユニットテスト
// ============================================================

describe("parseDateString", () => {
  it("日付文字列をパースする", async () => {
    const result = parseDateString("2025-04-15");
    expect(result).toEqual({ year: 2025, month: 4, day: 15 });
  });

  it("月と日が2桁の場合", async () => {
    const result = parseDateString("2025-12-31");
    expect(result).toEqual({ year: 2025, month: 12, day: 31 });
  });
});

describe("toDateString", () => {
  it("日付文字列を生成する", async () => {
    const result = toDateString(2025, 4, 15);
    expect(result).toBe("2025-04-15");
  });

  it("月と日を0埋めする", async () => {
    const result = toDateString(2025, 4, 5);
    expect(result).toBe("2025-04-05");
  });
});

describe("calculateTargetDate", () => {
  it("daily: 1日前の日付を返す", async () => {
    const result = calculateTargetDate("2025-04-15", "daily");
    expect(result).toBe("2025-04-14");
  });

  it("weekly: 8日前の日付を返す", async () => {
    const result = calculateTargetDate("2025-04-15", "weekly");
    expect(result).toBe("2025-04-07");
  });

  it("monthly: 前月末日を返す", async () => {
    const result = calculateTargetDate("2025-04-15", "monthly");
    expect(result).toBe("2025-03-31");
  });

  it("monthly: 2月の場合は1月末日を返す", async () => {
    const result = calculateTargetDate("2025-05-15", "monthly");
    expect(result).toBe("2025-04-30");
  });
});

describe("aggregateLiabilitiesByCategory", () => {
  it("負債をカテゴリ別に集計する", async () => {
    const holdings = [
      { type: "liability", liabilityCategory: "住宅ローン", amount: 20000000 },
      { type: "liability", liabilityCategory: "住宅ローン", amount: 5000000 },
      { type: "liability", liabilityCategory: "カードローン", amount: 500000 },
    ];

    const result = aggregateLiabilitiesByCategory(holdings);

    expect(result).toEqual([
      { category: "住宅ローン", amount: 25000000 },
      { category: "カードローン", amount: 500000 },
    ]);
  });

  it("liabilityCategoryがnullの場合はその他にまとめる", async () => {
    const holdings = [{ type: "liability", liabilityCategory: null, amount: 100000 }];

    const result = aggregateLiabilitiesByCategory(holdings);

    expect(result).toEqual([{ category: "その他", amount: 100000 }]);
  });

  it("資産は除外される", async () => {
    const holdings = [
      { type: "asset", liabilityCategory: null, amount: 1000000 },
      { type: "liability", liabilityCategory: "ローン", amount: 500000 },
    ];

    const result = aggregateLiabilitiesByCategory(holdings);

    expect(result).toEqual([{ category: "ローン", amount: 500000 }]);
  });

  it("amountがnullの場合はスキップ", async () => {
    const holdings = [{ type: "liability", liabilityCategory: "ローン", amount: null }];

    const result = aggregateLiabilitiesByCategory(holdings);

    expect(result).toEqual([]);
  });
});

describe("calculateCategoryChanges", () => {
  it("カテゴリ変動を計算する", async () => {
    const latestCategories = [
      { categoryName: "預金", amount: 150000 },
      { categoryName: "株式", amount: 100000 },
    ];
    const previousCategories = [
      { categoryName: "預金", amount: 130000 },
      { categoryName: "株式", amount: 70000 },
    ];

    const result = calculateCategoryChanges(latestCategories, previousCategories);

    expect(result).toContainEqual({
      name: "預金",
      current: 150000,
      previous: 130000,
      change: 20000,
    });
    expect(result).toContainEqual({
      name: "株式",
      current: 100000,
      previous: 70000,
      change: 30000,
    });
  });

  it("新しいカテゴリが追加された場合はpreviousを0として計算", async () => {
    const latestCategories = [{ categoryName: "新カテゴリ", amount: 100000 }];
    const previousCategories: Array<{ categoryName: string; amount: number }> = [];

    const result = calculateCategoryChanges(latestCategories, previousCategories);

    expect(result).toContainEqual({
      name: "新カテゴリ",
      current: 100000,
      previous: 0,
      change: 100000,
    });
  });

  it("消えたカテゴリはcurrentを0として計算", async () => {
    const latestCategories: Array<{ categoryName: string; amount: number }> = [];
    const previousCategories = [{ categoryName: "旧カテゴリ", amount: 100000 }];

    const result = calculateCategoryChanges(latestCategories, previousCategories);

    expect(result).toContainEqual({
      name: "旧カテゴリ",
      current: 0,
      previous: 100000,
      change: -100000,
    });
  });
});

// ============================================================
// 公開関数のテスト
// ============================================================

describe("getAssetBreakdownByCategory", () => {
  it("カテゴリ別資産を金額降順で返す", async () => {
    const historyId = await createAssetHistory({ date: "2025-04-15", totalAssets: 1700000 });
    await createAssetHistoryCategory({
      assetHistoryId: historyId,
      categoryName: "預金",
      amount: 500000,
    });
    await createAssetHistoryCategory({
      assetHistoryId: historyId,
      categoryName: "株式",
      amount: 1000000,
    });
    await createAssetHistoryCategory({
      assetHistoryId: historyId,
      categoryName: "債券",
      amount: 200000,
    });

    const result = await getAssetBreakdownByCategory(undefined, db);

    expect(result).toEqual([
      { category: "株式", amount: 1000000 },
      { category: "預金", amount: 500000 },
      { category: "債券", amount: 200000 },
    ]);
  });

  it("金額が0以下のカテゴリを除外する", async () => {
    const historyId = await createAssetHistory({ date: "2025-04-15", totalAssets: 500000 });
    await createAssetHistoryCategory({
      assetHistoryId: historyId,
      categoryName: "預金",
      amount: 500000,
    });
    await createAssetHistoryCategory({
      assetHistoryId: historyId,
      categoryName: "空カテゴリ",
      amount: 0,
    });

    const result = await getAssetBreakdownByCategory(undefined, db);

    expect(result).toEqual([{ category: "預金", amount: 500000 }]);
  });

  it("履歴がない場合は空配列を返す", async () => {
    const result = await getAssetBreakdownByCategory(undefined, db);
    expect(result).toEqual([]);
  });

  it("グループがない場合は空配列を返す", async () => {
    await resetTestDb(db);
    const result = await getAssetBreakdownByCategory(undefined, db);
    expect(result).toEqual([]);
  });
});

describe("getLiabilityBreakdownByCategory", () => {
  it("負債をカテゴリ別に集計して降順で返す", async () => {
    const accountId = await createTestAccount("Bank A");
    const snapshotId = await createSnapshot();

    const holdingId1 = await createHolding({
      accountId,
      name: "Loan A",
      type: "liability",
      liabilityCategory: "住宅ローン",
    });
    await createHoldingValue({ holdingId: holdingId1, snapshotId, amount: 20000000 });

    const holdingId2 = await createHolding({
      accountId,
      name: "Loan B",
      type: "liability",
      liabilityCategory: "住宅ローン",
    });
    await createHoldingValue({ holdingId: holdingId2, snapshotId, amount: 5000000 });

    const holdingId3 = await createHolding({
      accountId,
      name: "Card",
      type: "liability",
      liabilityCategory: "カードローン",
    });
    await createHoldingValue({ holdingId: holdingId3, snapshotId, amount: 500000 });

    const result = await getLiabilityBreakdownByCategory(undefined, db);

    expect(result).toEqual([
      { category: "住宅ローン", amount: 25000000 },
      { category: "カードローン", amount: 500000 },
    ]);
  });

  it("負債がない場合は空配列を返す", async () => {
    await createSnapshot();
    const result = await getLiabilityBreakdownByCategory(undefined, db);
    expect(result).toEqual([]);
  });
});

describe("getAssetHistory", () => {
  it("資産履歴を日付降順で返す", async () => {
    await createAssetHistory({ date: "2025-04-14", totalAssets: 100000 });
    await createAssetHistory({ date: "2025-04-15", totalAssets: 200000 });

    const result = await getAssetHistory(undefined, db);

    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2025-04-15");
    expect(result[1].date).toBe("2025-04-14");
  });

  it("limitを指定した場合は件数が制限される", async () => {
    await createAssetHistory({ date: "2025-04-14", totalAssets: 100000 });
    await createAssetHistory({ date: "2025-04-15", totalAssets: 200000 });

    const result = await getAssetHistory({ limit: 1 }, db);

    expect(result).toHaveLength(1);
  });

  it("グループがない場合は空配列を返す", async () => {
    await resetTestDb(db);
    const result = await getAssetHistory(undefined, db);
    expect(result).toEqual([]);
  });
});

describe("getAssetHistoryWithCategories", () => {
  it("履歴にカテゴリ情報を付与して返す", async () => {
    const historyId1 = await createAssetHistory({ date: "2025-04-15", totalAssets: 200000 });
    await createAssetHistoryCategory({
      assetHistoryId: historyId1,
      categoryName: "預金",
      amount: 150000,
    });
    await createAssetHistoryCategory({
      assetHistoryId: historyId1,
      categoryName: "株式",
      amount: 50000,
    });

    const historyId2 = await createAssetHistory({ date: "2025-04-14", totalAssets: 100000 });
    await createAssetHistoryCategory({
      assetHistoryId: historyId2,
      categoryName: "預金",
      amount: 100000,
    });

    const result = await getAssetHistoryWithCategories(undefined, db);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      date: "2025-04-15",
      totalAssets: 200000,
      categories: { 預金: 150000, 株式: 50000 },
    });
    expect(result[1]).toEqual({
      date: "2025-04-14",
      totalAssets: 100000,
      categories: { 預金: 100000 },
    });
  });

  it("履歴が空の場合は空配列を返す", async () => {
    const result = await getAssetHistoryWithCategories(undefined, db);
    expect(result).toEqual([]);
  });

  it("グループがない場合は空配列を返す", async () => {
    await resetTestDb(db);
    const result = await getAssetHistoryWithCategories(undefined, db);
    expect(result).toEqual([]);
  });
});

describe("getLatestTotalAssets", () => {
  it("最新の総資産を返す", async () => {
    await createAssetHistory({ date: "2025-04-14", totalAssets: 100000 });
    await createAssetHistory({ date: "2025-04-15", totalAssets: 200000 });

    const result = await getLatestTotalAssets(undefined, db);

    expect(result).toBe(200000);
  });

  it("データがない場合はnullを返す", async () => {
    const result = await getLatestTotalAssets(undefined, db);
    expect(result).toBeNull();
  });

  it("グループがない場合はnullを返す", async () => {
    await resetTestDb(db);
    const result = await getLatestTotalAssets(undefined, db);
    expect(result).toBeNull();
  });
});

describe("getDailyAssetChange", () => {
  it("前日比の変動を返す", async () => {
    await createAssetHistory({ date: "2025-04-14", totalAssets: 1000000 });
    await createAssetHistory({ date: "2025-04-15", totalAssets: 1200000 });

    const result = await getDailyAssetChange(undefined, db);

    expect(result).toEqual({
      today: 1200000,
      yesterday: 1000000,
      change: 200000,
    });
  });

  it("データが2件未満の場合はnullを返す", async () => {
    await createAssetHistory({ date: "2025-04-15", totalAssets: 100000 });

    const result = await getDailyAssetChange(undefined, db);

    expect(result).toBeNull();
  });

  it("資産減少の場合は負の変動を返す", async () => {
    await createAssetHistory({ date: "2025-04-14", totalAssets: 1000000 });
    await createAssetHistory({ date: "2025-04-15", totalAssets: 900000 });

    const result = await getDailyAssetChange(undefined, db);

    expect(result).toEqual({
      today: 900000,
      yesterday: 1000000,
      change: -100000,
    });
  });

  it("グループがない場合はnullを返す", async () => {
    await resetTestDb(db);
    const result = await getDailyAssetChange(undefined, db);
    expect(result).toBeNull();
  });
});

describe("getCategoryChangesForPeriod", () => {
  it("カテゴリ別の変動を計算して返す", async () => {
    const historyId1 = await createAssetHistory({ date: "2025-04-15", totalAssets: 250000 });
    await createAssetHistoryCategory({
      assetHistoryId: historyId1,
      categoryName: "預金",
      amount: 150000,
    });
    await createAssetHistoryCategory({
      assetHistoryId: historyId1,
      categoryName: "株式",
      amount: 100000,
    });

    const historyId2 = await createAssetHistory({ date: "2025-04-14", totalAssets: 200000 });
    await createAssetHistoryCategory({
      assetHistoryId: historyId2,
      categoryName: "預金",
      amount: 130000,
    });
    await createAssetHistoryCategory({
      assetHistoryId: historyId2,
      categoryName: "株式",
      amount: 70000,
    });

    const result = await getCategoryChangesForPeriod("daily", undefined, db);

    expect(result).not.toBeNull();
    expect(result!.total).toEqual({
      current: 250000,
      previous: 200000,
      change: 50000,
    });
    expect(result!.categories).toContainEqual({
      name: "預金",
      current: 150000,
      previous: 130000,
      change: 20000,
    });
  });

  it("最新データがない場合はnullを返す", async () => {
    const result = await getCategoryChangesForPeriod("daily", undefined, db);
    expect(result).toBeNull();
  });

  it("前期間データがない場合はnullを返す", async () => {
    await createAssetHistory({ date: "2025-04-15", totalAssets: 200000 });

    const result = await getCategoryChangesForPeriod("daily", undefined, db);

    expect(result).toBeNull();
  });

  it("最新と前期間が同じ日付の場合はnullを返す", async () => {
    await createAssetHistory({ date: "2025-04-15", totalAssets: 200000 });

    // 同じ日付しかないので比較対象がない
    const result = await getCategoryChangesForPeriod("daily", undefined, db);

    expect(result).toBeNull();
  });

  it("グループがない場合はnullを返す", async () => {
    await resetTestDb(db);
    const result = await getCategoryChangesForPeriod("daily", undefined, db);
    expect(result).toBeNull();
  });
});
