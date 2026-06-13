import { eq } from "drizzle-orm";
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
  getLatestSnapshot,
  getHoldingsWithLatestValues,
  getHoldingsByAccountId,
  getHoldingsWithDailyChange,
  hasInvestmentHoldings,
  buildHoldingWhereCondition,
} from "./holding";

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
  await createTestGroup(db);
});

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

async function createAssetCategory(name: string): Promise<number> {
  const now = new Date().toISOString();
  const category = await db
    .insert(schema.assetCategories)
    .values({
      name,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return category.id;
}

async function createHolding(data: {
  accountId: number;
  name: string;
  type?: "asset" | "liability";
  categoryId?: number | null;
  liabilityCategory?: string | null;
  code?: string | null;
}): Promise<number> {
  const now = new Date().toISOString();
  const holding = await db
    .insert(schema.holdings)
    .values({
      accountId: data.accountId,
      name: data.name,
      type: data.type ?? "asset",
      categoryId: data.categoryId ?? null,
      liabilityCategory: data.liabilityCategory ?? null,
      code: data.code ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return holding.id;
}

async function createHoldingValue(data: {
  holdingId: number;
  snapshotId: number;
  amount?: number;
  quantity?: number | null;
  unitPrice?: number | null;
  avgCostPrice?: number | null;
  dailyChange?: number | null;
  unrealizedGain?: number | null;
  unrealizedGainPct?: number | null;
}) {
  const now = new Date().toISOString();
  await db
    .insert(schema.holdingValues)
    .values({
      holdingId: data.holdingId,
      snapshotId: data.snapshotId,
      amount: data.amount ?? 100000,
      quantity: data.quantity ?? null,
      unitPrice: data.unitPrice ?? null,
      avgCostPrice: data.avgCostPrice ?? null,
      dailyChange: data.dailyChange ?? null,
      unrealizedGain: data.unrealizedGain ?? null,
      unrealizedGainPct: data.unrealizedGainPct ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

// ============================================================
// 内部関数のユニットテスト
// ============================================================

describe("buildHoldingWhereCondition", () => {
  it("snapshotIdのみで条件を構築する", async () => {
    const condition = buildHoldingWhereCondition(1, []);
    expect(condition).toBeDefined();
  });

  it("accountIdsがある場合はinArray条件を追加する", async () => {
    const condition = buildHoldingWhereCondition(1, [1, 2, 3]);
    expect(condition).toBeDefined();
  });

  it("追加条件がある場合はそれも含める", async () => {
    const additionalCondition = eq(schema.holdingValues.amount, 100);
    const condition = buildHoldingWhereCondition(1, [], additionalCondition);
    expect(condition).toBeDefined();
  });

  it("accountIdsと追加条件の両方がある場合", async () => {
    const additionalCondition = eq(schema.holdingValues.amount, 100);
    const condition = buildHoldingWhereCondition(1, [1, 2], additionalCondition);
    expect(condition).toBeDefined();
  });
});

// ============================================================
// 公開関数のテスト
// ============================================================

describe("getLatestSnapshot", () => {
  it("最新のスナップショットを返す", async () => {
    await createSnapshot();

    const result = await getLatestSnapshot(db);

    expect(result).not.toBeNull();
    expect(result!.date).toBe("2025-04-15");
  });

  it("複数のスナップショットがある場合は最新を返す", async () => {
    const now = new Date().toISOString();
    await db
      .insert(schema.dailySnapshots)
      .values({
        groupId: TEST_GROUP_ID,
        date: "2025-04-14",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    await db
      .insert(schema.dailySnapshots)
      .values({
        groupId: TEST_GROUP_ID,
        date: "2025-04-15",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const result = await getLatestSnapshot(db);

    expect(result!.date).toBe("2025-04-15");
  });

  it("スナップショットがない場合はundefinedを返す", async () => {
    const result = await getLatestSnapshot(db);
    expect(result).toBeUndefined();
  });
});

describe("getHoldingsWithLatestValues", () => {
  it("最新スナップショットの保有資産を返す", async () => {
    const accountId = await createTestAccount("Bank A");
    const snapshotId = await createSnapshot();
    const categoryId = await createAssetCategory("株式(現物)");
    const holdingId = await createHolding({
      accountId,
      name: "Stock A",
      categoryId,
    });
    await createHoldingValue({
      holdingId,
      snapshotId,
      amount: 500000,
      dailyChange: 10000,
    });

    const result = await getHoldingsWithLatestValues(undefined, db);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Stock A");
    expect(result[0].amount).toBe(500000);
    expect(result[0].categoryName).toBe("株式(現物)");
  });

  it("スナップショットがない場合は空配列を返す", async () => {
    const result = await getHoldingsWithLatestValues(undefined, db);
    expect(result).toEqual([]);
  });

  it("グループでフィルタリングされる", async () => {
    const accountId = await createTestAccount("Bank A");
    const snapshotId = await createSnapshot();

    // グループ内のアカウント
    const holdingId1 = await createHolding({ accountId, name: "Holding A" });
    await createHoldingValue({ holdingId: holdingId1, snapshotId, amount: 100000 });

    // グループ外のアカウント
    const now = new Date().toISOString();
    const outsideAccount = await db
      .insert(schema.accounts)
      .values({
        mfId: "mf_outside",
        name: "Outside",
        type: "bank",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    const holdingId2 = await createHolding({ accountId: outsideAccount.id, name: "Holding B" });
    await createHoldingValue({ holdingId: holdingId2, snapshotId, amount: 200000 });

    const result = await getHoldingsWithLatestValues(undefined, db);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Holding A");
  });
});

describe("getHoldingsByAccountId", () => {
  it("指定したアカウントの保有資産を返す", async () => {
    const accountId = await createTestAccount("Bank A");
    const snapshotId = await createSnapshot();
    const holdingId = await createHolding({ accountId, name: "Holding A" });
    await createHoldingValue({ holdingId, snapshotId, amount: 100000 });

    const result = await getHoldingsByAccountId(accountId, undefined, db);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Holding A");
  });

  it("グループ外のアカウントは空配列を返す", async () => {
    const now = new Date().toISOString();
    await createSnapshot();
    const outsideAccount = await db
      .insert(schema.accounts)
      .values({
        mfId: "mf_outside",
        name: "Outside",
        type: "bank",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    const result = await getHoldingsByAccountId(outsideAccount.id, undefined, db);

    expect(result).toEqual([]);
  });

  it("スナップショットがない場合は空配列を返す", async () => {
    const accountId = await createTestAccount("Bank A");
    const result = await getHoldingsByAccountId(accountId, undefined, db);
    expect(result).toEqual([]);
  });

  it("グループがない場合は空配列を返す", async () => {
    await resetTestDb(db);
    const result = await getHoldingsByAccountId(1, undefined, db);
    expect(result).toEqual([]);
  });
});

describe("getHoldingsWithDailyChange", () => {
  it("日次変動がある保有資産を返す", async () => {
    const accountId = await createTestAccount("Bank A");
    const snapshotId = await createSnapshot();

    const holdingId1 = await createHolding({ accountId, name: "Stock A", code: "1234" });
    await createHoldingValue({
      holdingId: holdingId1,
      snapshotId,
      amount: 100000,
      dailyChange: 5000,
    });

    const holdingId2 = await createHolding({ accountId, name: "Stock B", code: "5678" });
    await createHoldingValue({
      holdingId: holdingId2,
      snapshotId,
      amount: 200000,
      dailyChange: null,
    });

    const result = await getHoldingsWithDailyChange(undefined, db);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Stock A");
    expect(result[0].dailyChange).toBe(5000);
  });

  it("スナップショットがない場合は空配列を返す", async () => {
    const result = await getHoldingsWithDailyChange(undefined, db);
    expect(result).toEqual([]);
  });
});

describe("hasInvestmentHoldings", () => {
  it("投資銘柄がある場合はtrueを返す", async () => {
    const accountId = await createTestAccount("Bank A");
    const snapshotId = await createSnapshot();
    const categoryId = await createAssetCategory("株式(現物)");
    const holdingId = await createHolding({ accountId, name: "Stock", categoryId });
    await createHoldingValue({ holdingId, snapshotId });

    const result = await hasInvestmentHoldings(undefined, db);

    expect(result).toBe(true);
  });

  it("投資信託がある場合もtrueを返す", async () => {
    const accountId = await createTestAccount("Bank A");
    const snapshotId = await createSnapshot();
    const categoryId = await createAssetCategory("投資信託");
    const holdingId = await createHolding({ accountId, name: "Fund", categoryId });
    await createHoldingValue({ holdingId, snapshotId });

    const result = await hasInvestmentHoldings(undefined, db);

    expect(result).toBe(true);
  });

  it("投資銘柄がない場合はfalseを返す", async () => {
    const accountId = await createTestAccount("Bank A");
    const snapshotId = await createSnapshot();
    const categoryId = await createAssetCategory("預金");
    const holdingId = await createHolding({ accountId, name: "Deposit", categoryId });
    await createHoldingValue({ holdingId, snapshotId });

    const result = await hasInvestmentHoldings(undefined, db);

    expect(result).toBe(false);
  });

  it("保有資産がない場合はfalseを返す", async () => {
    await createSnapshot();
    const result = await hasInvestmentHoldings(undefined, db);
    expect(result).toBe(false);
  });

  it("スナップショットがない場合はfalseを返す", async () => {
    const result = await hasInvestmentHoldings(undefined, db);
    expect(result).toBe(false);
  });
});
