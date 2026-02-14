import { describe, test, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { AssetHistoryPoint } from "../types";
import * as schema from "../schema/schema";
import {
  createTestDb,
  resetTestDb,
  closeTestDb,
  createTestGroup,
  TEST_GROUP_ID,
} from "../test-helpers";
import { saveAssetHistory } from "./summaries";

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

describe("saveAssetHistory", () => {
  const points: AssetHistoryPoint[] = [
    {
      date: "2025-04-25",
      totalAssets: 10000000,
      change: 50000,
      categories: {
        "預金・現金・暗号資産": 3000000,
        "株式（現物）": 2000000,
        投資信託: 3000000,
        保険: 500000,
        年金: 1000000,
        ポイント: 500000,
      },
    },
  ];

  test("資産履歴を保存できる", async () => {
    await saveAssetHistory(db, TEST_GROUP_ID, points);
    const result = await db.select().from(schema.assetHistory).all();
    expect(result).toHaveLength(1);
    expect(result[0].totalAssets).toBe(10000000);

    const categories = await db.select().from(schema.assetHistoryCategories).all();
    expect(categories).toHaveLength(6);
    const deposit = categories.find((c) => c.categoryName === "預金・現金・暗号資産");
    expect(deposit?.amount).toBe(3000000);
  });

  test("同じ日は upsert される", async () => {
    await saveAssetHistory(db, TEST_GROUP_ID, points);
    await saveAssetHistory(db, TEST_GROUP_ID, [
      {
        ...points[0],
        totalAssets: 11000000,
        categories: {
          "預金・現金・暗号資産": 4000000,
          "株式（現物）": 2000000,
          投資信託: 3000000,
          保険: 500000,
          年金: 1000000,
          ポイント: 500000,
        },
      },
    ]);
    const result = await db.select().from(schema.assetHistory).all();
    expect(result).toHaveLength(1);
    expect(result[0].totalAssets).toBe(11000000);

    const categories = await db.select().from(schema.assetHistoryCategories).all();
    const deposit = categories.find((c) => c.categoryName === "預金・現金・暗号資産");
    expect(deposit?.amount).toBe(4000000);
  });

  test("スクレイピング結果にないカテゴリは削除される", async () => {
    // 最初に保険カテゴリを含むデータを保存
    await saveAssetHistory(db, TEST_GROUP_ID, points);
    const categoriesBefore = await db.select().from(schema.assetHistoryCategories).all();
    expect(categoriesBefore).toHaveLength(6);
    expect(categoriesBefore.find((c) => c.categoryName === "保険")).toBeDefined();

    // 保険カテゴリを含まないデータで更新
    await saveAssetHistory(db, TEST_GROUP_ID, [
      {
        ...points[0],
        categories: {
          "預金・現金・暗号資産": 3000000,
          "株式（現物）": 2000000,
          投資信託: 3000000,
          年金: 1000000,
          ポイント: 500000,
          // 保険カテゴリなし
        },
      },
    ]);

    const categoriesAfter = await db.select().from(schema.assetHistoryCategories).all();
    expect(categoriesAfter).toHaveLength(5);
    expect(categoriesAfter.find((c) => c.categoryName === "保険")).toBeUndefined();
  });

  test("カテゴリが空の場合は全削除される", async () => {
    await saveAssetHistory(db, TEST_GROUP_ID, points);
    const categoriesBefore = await db.select().from(schema.assetHistoryCategories).all();
    expect(categoriesBefore).toHaveLength(6);

    // 空のカテゴリで更新
    await saveAssetHistory(db, TEST_GROUP_ID, [
      {
        ...points[0],
        categories: {},
      },
    ]);

    const categoriesAfter = await db.select().from(schema.assetHistoryCategories).all();
    expect(categoriesAfter).toHaveLength(0);
  });
});

describe("グループ分離", () => {
  const GROUP_A = "group_a";
  const GROUP_B = "group_b";

  beforeEach(async () => {
    const ts = new Date().toISOString();
    await db
      .insert(schema.groups)
      .values({ id: GROUP_A, name: "グループA", isCurrent: false, createdAt: ts, updatedAt: ts })
      .run();
    await db
      .insert(schema.groups)
      .values({ id: GROUP_B, name: "グループB", isCurrent: false, createdAt: ts, updatedAt: ts })
      .run();
  });

  test("異なるグループで独立した資産履歴を保存できる", async () => {
    const pointsA: AssetHistoryPoint[] = [
      {
        date: "2025-04-25",
        totalAssets: 10000000,
        change: 50000,
        categories: { "預金・現金・暗号資産": 5000000, "株式（現物）": 5000000 },
      },
    ];
    const pointsB: AssetHistoryPoint[] = [
      {
        date: "2025-04-25", // 同じ日付
        totalAssets: 20000000,
        change: 100000,
        categories: { "預金・現金・暗号資産": 15000000, 投資信託: 5000000 },
      },
    ];

    await saveAssetHistory(db, GROUP_A, pointsA);
    await saveAssetHistory(db, GROUP_B, pointsB);

    const all = await db.select().from(schema.assetHistory).all();
    expect(all).toHaveLength(2);

    const historyA = all.find((h) => h.groupId === GROUP_A);
    const historyB = all.find((h) => h.groupId === GROUP_B);

    expect(historyA?.totalAssets).toBe(10000000);
    expect(historyB?.totalAssets).toBe(20000000);
  });
});
