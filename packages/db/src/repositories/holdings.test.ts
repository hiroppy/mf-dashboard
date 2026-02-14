import { describe, test, expect, beforeAll, beforeEach, afterAll } from "vitest";
import * as schema from "../schema/schema";
import { createTestDb, resetTestDb, closeTestDb } from "../test-helpers";
import { upsertAccount } from "./accounts";
import { getOrCreateCategory } from "./categories";
import { upsertGroup } from "./groups";
import { createHolding, saveHoldingValue } from "./holdings";
import { createSnapshot } from "./snapshots";

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
});

describe("createHolding + saveHoldingValue", () => {
  test("holdings と holding_values を作成できる", async () => {
    const accountId = await upsertAccount(db, {
      mfId: "acc1",
      name: "テスト証券",
      type: "自動連携",
      status: "ok",
      lastUpdated: "2025-04-01",
      url: "",
      totalAssets: 0,
    });
    await upsertGroup(db, { id: "g1", name: "test", isCurrent: true });
    const snapshotId = await createSnapshot(db, "g1", "2025-04-26");
    const categoryId = await getOrCreateCategory(db, "投資信託");

    const holdingId = await createHolding(db, accountId, "テストファンド", "asset", {
      categoryId,
    });
    expect(holdingId).toBeGreaterThan(0);

    await saveHoldingValue(db, holdingId, snapshotId, {
      amount: 1000000,
      quantity: 100,
      unitPrice: 10000,
    });

    const values = await db.select().from(schema.holdingValues).all();
    expect(values).toHaveLength(1);
    expect(values[0].amount).toBe(1000000);
  });
});
