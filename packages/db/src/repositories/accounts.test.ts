import { eq } from "drizzle-orm";
import { describe, test, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { AccountStatus } from "../types";
import * as schema from "../schema/schema";
import { createTestDb, resetTestDb, closeTestDb } from "../test-helpers";
import { upsertAccount, saveAccountStatus, updateAccountCategory } from "./accounts";

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

describe("upsertAccount", () => {
  const account: AccountStatus = {
    mfId: "acc1",
    name: "テスト銀行",
    type: "自動連携",
    status: "ok",
    lastUpdated: "2025-04-01",
    url: "/accounts/show/acc1",
    totalAssets: 1000000,
  };

  test("新規アカウントを作成して ID を返す", async () => {
    const id = await upsertAccount(db, account);
    expect(id).toBeGreaterThan(0);
    const result = await db.select().from(schema.accounts).all();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("テスト銀行");
  });

  test("既存アカウントは更新して同じ ID を返す", async () => {
    const id1 = await upsertAccount(db, account);
    const id2 = await upsertAccount(db, { ...account, name: "更新銀行" });
    expect(id1).toBe(id2);
    const result = await db.select().from(schema.accounts).all();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("更新銀行");
  });
});

describe("saveAccountStatus", () => {
  test("アカウントステータスを保存できる", async () => {
    const accountId = await upsertAccount(db, {
      mfId: "acc1",
      name: "テスト銀行",
      type: "自動連携",
      status: "ok",
      lastUpdated: "2025-04-01",
      url: "",
      totalAssets: 1000000,
    });
    await saveAccountStatus(db, accountId, {
      mfId: "acc1",
      name: "テスト銀行",
      type: "自動連携",
      status: "ok",
      lastUpdated: "01/25 08:51",
      url: "",
      totalAssets: 1000000,
    });
    const result = await db.select().from(schema.accountStatuses).all();
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("ok");
    expect(result[0].totalAssets).toBe(1000000);
  });
});

describe("updateAccountCategory", () => {
  test("アカウントにカテゴリーを設定できる", async () => {
    await upsertAccount(db, {
      mfId: "acc1",
      name: "SBI銀行",
      type: "自動連携",
      status: "ok",
      lastUpdated: "2025-04-01",
      url: "",
      totalAssets: 1000000,
    });

    await updateAccountCategory(db, "acc1", "銀行");

    const account = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.mfId, "acc1"))
      .get();

    expect(account).toBeDefined();
    expect(account!.categoryId).toBeGreaterThan(0);

    // カテゴリーテーブルにも作成されていることを確認
    const category = await db
      .select()
      .from(schema.institutionCategories)
      .where(eq(schema.institutionCategories.id, account!.categoryId!))
      .get();

    expect(category).toBeDefined();
    expect(category!.name).toBe("銀行");
  });

  test("同じカテゴリー名で複数のアカウントを更新できる", async () => {
    await upsertAccount(db, {
      mfId: "acc1",
      name: "SBI銀行",
      type: "自動連携",
      status: "ok",
      lastUpdated: "2025-04-01",
      url: "",
      totalAssets: 1000000,
    });

    await upsertAccount(db, {
      mfId: "acc2",
      name: "三井住友銀行",
      type: "自動連携",
      status: "ok",
      lastUpdated: "2025-04-01",
      url: "",
      totalAssets: 500000,
    });

    await updateAccountCategory(db, "acc1", "銀行");
    await updateAccountCategory(db, "acc2", "銀行");

    const accounts = await db.select().from(schema.accounts).all();
    expect(accounts).toHaveLength(2);
    // 両方とも同じcategoryIdを持つ
    expect(accounts[0].categoryId).toBe(accounts[1].categoryId);

    // カテゴリーは1つだけ作成される
    const categories = await db.select().from(schema.institutionCategories).all();
    expect(categories).toHaveLength(1);
    expect(categories[0].name).toBe("銀行");
  });

  test("異なるカテゴリーで複数のアカウントを更新できる", async () => {
    await upsertAccount(db, {
      mfId: "acc1",
      name: "SBI銀行",
      type: "自動連携",
      status: "ok",
      lastUpdated: "2025-04-01",
      url: "",
      totalAssets: 1000000,
    });

    await upsertAccount(db, {
      mfId: "acc2",
      name: "SBI証券",
      type: "自動連携",
      status: "ok",
      lastUpdated: "2025-04-01",
      url: "",
      totalAssets: 5000000,
    });

    await updateAccountCategory(db, "acc1", "銀行");
    await updateAccountCategory(db, "acc2", "証券");

    const accounts = await db.select().from(schema.accounts).all();
    expect(accounts).toHaveLength(2);
    // 異なるcategoryIdを持つ
    expect(accounts[0].categoryId).not.toBe(accounts[1].categoryId);

    // カテゴリーは2つ作成される
    const categories = await db.select().from(schema.institutionCategories).all();
    expect(categories).toHaveLength(2);
    expect(categories.map((c) => c.name)).toEqual(expect.arrayContaining(["銀行", "証券"]));
  });
});
