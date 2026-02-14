import { describe, test, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { SpendingTargetsData } from "../types";
import * as schema from "../schema/schema";
import {
  createTestDb,
  resetTestDb,
  closeTestDb,
  createTestGroup,
  TEST_GROUP_ID,
} from "../test-helpers";
import { saveSpendingTargets, getSpendingTargets } from "./spending-targets";

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

const sampleData: SpendingTargetsData = {
  categories: [
    {
      largeCategoryId: 11,
      name: "食費",
      type: "variable",
    },
    {
      largeCategoryId: 12,
      name: "日用品",
      type: "variable",
    },
    {
      largeCategoryId: 13,
      name: "住宅",
      type: "fixed",
    },
  ],
};

describe("saveSpendingTargets", () => {
  test("カテゴリ別の固定費/変動費を保存できる", async () => {
    await saveSpendingTargets(db, TEST_GROUP_ID, sampleData);

    const targets = await db.select().from(schema.spendingTargets).all();
    expect(targets).toHaveLength(3);

    const food = targets.find((t) => t.largeCategoryId === 11);
    expect(food?.categoryName).toBe("食費");
    expect(food?.type).toBe("variable");

    const housing = targets.find((t) => t.largeCategoryId === 13);
    expect(housing?.categoryName).toBe("住宅");
    expect(housing?.type).toBe("fixed");
  });

  test("既存データを upsert で更新できる", async () => {
    await saveSpendingTargets(db, TEST_GROUP_ID, sampleData);

    const updatedData: SpendingTargetsData = {
      categories: [
        {
          largeCategoryId: 11,
          name: "食費",
          type: "fixed", // variable → fixed に変更
        },
      ],
    };

    await saveSpendingTargets(db, TEST_GROUP_ID, updatedData);

    const targets = await db.select().from(schema.spendingTargets).all();
    const food = targets.find((t) => t.largeCategoryId === 11);
    expect(food?.type).toBe("fixed");
  });
});

describe("getSpendingTargets", () => {
  test("保存した予算カテゴリを取得できる", async () => {
    await saveSpendingTargets(db, TEST_GROUP_ID, sampleData);

    const targets = await getSpendingTargets(db, TEST_GROUP_ID);
    expect(targets).toHaveLength(3);
    expect(targets.map((t) => t.categoryName)).toEqual(
      expect.arrayContaining(["食費", "日用品", "住宅"]),
    );
  });

  test("データがない場合は空配列を返す", async () => {
    const targets = await getSpendingTargets(db, TEST_GROUP_ID);
    expect(targets).toHaveLength(0);
  });
});

describe("グループ分離", () => {
  const GROUP_A = "group_a";
  const GROUP_B = "group_b";

  const dataA: SpendingTargetsData = {
    categories: [
      {
        largeCategoryId: 11,
        name: "食費",
        type: "variable",
      },
    ],
  };

  const dataB: SpendingTargetsData = {
    categories: [
      {
        largeCategoryId: 11,
        name: "食費",
        type: "fixed", // 同じカテゴリIDだが異なるタイプ
      },
      {
        largeCategoryId: 14,
        name: "交通費",
        type: "fixed",
      },
    ],
  };

  beforeEach(async () => {
    // 複数グループを作成
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

  test("異なるグループで同じカテゴリIDでも独立した設定を保存できる", async () => {
    await saveSpendingTargets(db, GROUP_A, dataA);
    await saveSpendingTargets(db, GROUP_B, dataB);

    const targetsA = await getSpendingTargets(db, GROUP_A);
    const targetsB = await getSpendingTargets(db, GROUP_B);

    // グループAは1カテゴリ、グループBは2カテゴリ
    expect(targetsA).toHaveLength(1);
    expect(targetsB).toHaveLength(2);

    // 同じカテゴリID(11)でも異なるタイプを持つ
    const foodA = targetsA.find((t) => t.largeCategoryId === 11);
    const foodB = targetsB.find((t) => t.largeCategoryId === 11);

    expect(foodA?.type).toBe("variable");
    expect(foodB?.type).toBe("fixed");
  });

  test("存在しないグループIDでは空の結果を返す", async () => {
    await saveSpendingTargets(db, GROUP_A, dataA);

    const targets = await getSpendingTargets(db, "non_existent_group");
    expect(targets).toHaveLength(0);
  });

  test("一方のグループを更新しても他方に影響しない", async () => {
    await saveSpendingTargets(db, GROUP_A, dataA);
    await saveSpendingTargets(db, GROUP_B, dataB);

    // グループAを更新
    const updatedDataA: SpendingTargetsData = {
      categories: [
        {
          largeCategoryId: 11,
          name: "食費",
          type: "fixed", // variable → fixed に変更
        },
      ],
    };
    await saveSpendingTargets(db, GROUP_A, updatedDataA);

    // グループBは変更されていないことを確認
    const targetsB = await getSpendingTargets(db, GROUP_B);
    expect(targetsB.find((t) => t.largeCategoryId === 11)?.type).toBe("fixed");
  });

  test("DBに保存されるレコード数が正しい", async () => {
    await saveSpendingTargets(db, GROUP_A, dataA);
    await saveSpendingTargets(db, GROUP_B, dataB);

    const allTargets = await db.select().from(schema.spendingTargets).all();

    // グループA: 1ターゲット
    // グループB: 2ターゲット
    expect(allTargets).toHaveLength(3);
  });
});
