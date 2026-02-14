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
  getLatestUpdateDate,
  getAccountsWithAssets,
  getAllAccountMfIds,
  getAccountByMfId,
  getAccountsGroupedByCategory,
  normalizeAccount,
  buildActiveAccountCondition,
  groupAccountsByCategory,
} from "./account";

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

async function createTestAccount(data: {
  mfId: string;
  name: string;
  type?: string;
  isActive?: boolean;
  categoryId?: number | null;
}): Promise<number> {
  const now = new Date().toISOString();
  const account = await db
    .insert(schema.accounts)
    .values({
      mfId: data.mfId,
      name: data.name,
      type: data.type ?? "bank",
      isActive: data.isActive ?? true,
      categoryId: data.categoryId ?? null,
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

async function createAccountStatus(
  accountId: number,
  data: {
    status?: string;
    lastUpdated?: string;
    totalAssets?: number;
    errorMessage?: string | null;
  },
) {
  const now = new Date().toISOString();
  await db
    .insert(schema.accountStatuses)
    .values({
      accountId,
      status: data.status ?? "ok",
      lastUpdated: data.lastUpdated ?? now,
      totalAssets: data.totalAssets ?? 0,
      errorMessage: data.errorMessage ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

async function createCategory(name: string, displayOrder: number): Promise<number> {
  const now = new Date().toISOString();
  const category = await db
    .insert(schema.institutionCategories)
    .values({
      name,
      displayOrder,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return category.id;
}

// ============================================================
// 内部関数のユニットテスト
// ============================================================

describe("normalizeAccount", () => {
  it("nullフィールドにデフォルト値を適用する", () => {
    const account = {
      id: 1,
      mfId: "mf1",
      name: "Bank A",
      type: "bank",
      status: null,
      lastUpdated: null,
      totalAssets: null,
      categoryId: null,
      categoryName: null,
      categoryDisplayOrder: null,
    };

    const result = normalizeAccount(account);

    expect(result.status).toBe("ok");
    expect(result.totalAssets).toBe(0);
    expect(result.categoryName).toBe("未分類");
    expect(result.categoryDisplayOrder).toBe(999);
  });

  it("既存の値は変更しない", () => {
    const account = {
      id: 1,
      mfId: "mf1",
      name: "Bank A",
      type: "bank",
      status: "alert",
      lastUpdated: "2025-04-15",
      totalAssets: 100000,
      categoryId: 1,
      categoryName: "銀行",
      categoryDisplayOrder: 1,
    };

    const result = normalizeAccount(account);

    expect(result.status).toBe("alert");
    expect(result.totalAssets).toBe(100000);
    expect(result.categoryName).toBe("銀行");
    expect(result.categoryDisplayOrder).toBe(1);
  });
});

describe("buildActiveAccountCondition", () => {
  it("アクティブなアカウントのみをフィルタリングする", async () => {
    await createTestAccount({ mfId: "mf1", name: "Active Account", isActive: true });
    await createTestAccount({ mfId: "mf2", name: "Inactive Account", isActive: false });

    const accountIds = (
      await db.select({ id: schema.accounts.id }).from(schema.accounts).all()
    ).map((a) => a.id);

    const condition = buildActiveAccountCondition(accountIds);
    const results = await db.select().from(schema.accounts).where(condition).all();

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Active Account");
  });

  it("mfId='unknown'のアカウントを除外する", async () => {
    await createTestAccount({ mfId: "mf1", name: "Normal Account" });
    // unknownアカウント（mfIdがunknown）を直接作成
    const now = new Date().toISOString();
    const unknownAccount = await db
      .insert(schema.accounts)
      .values({
        mfId: "unknown",
        name: "Unknown Account",
        type: "bank",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    await db
      .insert(schema.groupAccounts)
      .values({
        groupId: TEST_GROUP_ID,
        accountId: unknownAccount.id,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const accountIds = (
      await db.select({ id: schema.accounts.id }).from(schema.accounts).all()
    ).map((a) => a.id);

    const condition = buildActiveAccountCondition(accountIds);
    const results = await db.select().from(schema.accounts).where(condition).all();

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Normal Account");
  });

  it("指定されたaccountIds内のみをフィルタリングする", async () => {
    const accountId1 = await createTestAccount({ mfId: "mf1", name: "Account 1" });
    await createTestAccount({ mfId: "mf2", name: "Account 2" });

    const condition = buildActiveAccountCondition([accountId1]);
    const results = await db.select().from(schema.accounts).where(condition).all();

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Account 1");
  });
});

describe("groupAccountsByCategory", () => {
  it("カテゴリ別にアカウントをグループ化する", () => {
    const accounts = [
      {
        id: 1,
        mfId: "mf1",
        name: "Bank A",
        type: "bank",
        status: "ok",
        lastUpdated: null,
        totalAssets: 100000,
        categoryId: 1,
        categoryName: "銀行",
        categoryDisplayOrder: 1,
      },
      {
        id: 2,
        mfId: "mf2",
        name: "Investment A",
        type: "investment",
        status: "ok",
        lastUpdated: null,
        totalAssets: 500000,
        categoryId: 2,
        categoryName: "証券",
        categoryDisplayOrder: 2,
      },
      {
        id: 3,
        mfId: "mf3",
        name: "Bank B",
        type: "bank",
        status: "ok",
        lastUpdated: null,
        totalAssets: 200000,
        categoryId: 1,
        categoryName: "銀行",
        categoryDisplayOrder: 1,
      },
    ];

    const result = groupAccountsByCategory(accounts);

    expect(result).toHaveLength(2);
    expect(result[0].categoryName).toBe("銀行");
    expect(result[0].accounts).toHaveLength(2);
    expect(result[1].categoryName).toBe("証券");
    expect(result[1].accounts).toHaveLength(1);
  });

  it("同じカテゴリ内でtotalAssets降順にソートする", () => {
    const accounts = [
      {
        id: 1,
        mfId: "mf1",
        name: "Bank A",
        type: "bank",
        status: "ok",
        lastUpdated: null,
        totalAssets: 100000,
        categoryId: 1,
        categoryName: "銀行",
        categoryDisplayOrder: 1,
      },
      {
        id: 2,
        mfId: "mf2",
        name: "Bank B",
        type: "bank",
        status: "ok",
        lastUpdated: null,
        totalAssets: 500000,
        categoryId: 1,
        categoryName: "銀行",
        categoryDisplayOrder: 1,
      },
      {
        id: 3,
        mfId: "mf3",
        name: "Bank C",
        type: "bank",
        status: "ok",
        lastUpdated: null,
        totalAssets: 200000,
        categoryId: 1,
        categoryName: "銀行",
        categoryDisplayOrder: 1,
      },
    ];

    const result = groupAccountsByCategory(accounts);

    expect(result[0].accounts[0].name).toBe("Bank B");
    expect(result[0].accounts[1].name).toBe("Bank C");
    expect(result[0].accounts[2].name).toBe("Bank A");
  });

  it("カテゴリをdisplayOrder順にソートする", () => {
    const accounts = [
      {
        id: 1,
        mfId: "mf1",
        name: "Investment",
        type: "investment",
        status: "ok",
        lastUpdated: null,
        totalAssets: 100000,
        categoryId: 2,
        categoryName: "証券",
        categoryDisplayOrder: 2,
      },
      {
        id: 2,
        mfId: "mf2",
        name: "Bank",
        type: "bank",
        status: "ok",
        lastUpdated: null,
        totalAssets: 100000,
        categoryId: 1,
        categoryName: "銀行",
        categoryDisplayOrder: 1,
      },
    ];

    const result = groupAccountsByCategory(accounts);

    expect(result[0].categoryName).toBe("銀行");
    expect(result[1].categoryName).toBe("証券");
  });

  it("空配列の場合は空配列を返す", () => {
    const result = groupAccountsByCategory([]);
    expect(result).toEqual([]);
  });
});

// ============================================================
// 公開関数のテスト
// ============================================================

describe("getLatestUpdateDate", () => {
  it("グループの最終スクレイプ日時を返す", async () => {
    await db
      .update(schema.groups)
      .set({ lastScrapedAt: "2025-04-15T10:00:00Z" })
      .where(eq(schema.groups.id, TEST_GROUP_ID))
      .run();

    const result = await getLatestUpdateDate(undefined, db);

    expect(result).toBe("2025-04-15T10:00:00Z");
  });

  it("lastScrapedAtがnullの場合はnullを返す", async () => {
    const result = await getLatestUpdateDate(undefined, db);
    expect(result).toBeNull();
  });

  it("グループがない場合はnullを返す", async () => {
    await resetTestDb(db);
    const result = await getLatestUpdateDate(undefined, db);
    expect(result).toBeNull();
  });
});

describe("getAccountsWithAssets", () => {
  it("アカウント一覧を資産情報付きで返す", async () => {
    const categoryId = await createCategory("銀行", 1);
    const accountId = await createTestAccount({
      mfId: "mf1",
      name: "Bank A",
      categoryId,
    });
    await createAccountStatus(accountId, {
      status: "ok",
      lastUpdated: "2025-04-15",
      totalAssets: 100000,
    });

    const result = await getAccountsWithAssets(undefined, db);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Bank A");
    expect(result[0].totalAssets).toBe(100000);
    expect(result[0].categoryName).toBe("銀行");
  });

  it("nullフィールドにデフォルト値を適用する", async () => {
    await createTestAccount({ mfId: "mf1", name: "Bank A" });
    // statusを作成しない（nullになる）

    const result = await getAccountsWithAssets(undefined, db);

    expect(result[0].status).toBe("ok");
    expect(result[0].totalAssets).toBe(0);
    expect(result[0].categoryName).toBe("未分類");
  });

  it("非アクティブなアカウントは除外される", async () => {
    await createTestAccount({ mfId: "mf1", name: "Active", isActive: true });
    await createTestAccount({ mfId: "mf2", name: "Inactive", isActive: false });

    const result = await getAccountsWithAssets(undefined, db);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Active");
  });

  it("グループがない場合は空配列を返す", async () => {
    await resetTestDb(db);
    const result = await getAccountsWithAssets(undefined, db);
    expect(result).toEqual([]);
  });
});

describe("getAllAccountMfIds", () => {
  it("グループ内のアカウントのmfIdリストを返す", async () => {
    await createTestAccount({ mfId: "mf1", name: "Account 1" });
    await createTestAccount({ mfId: "mf2", name: "Account 2" });

    const result = await getAllAccountMfIds(undefined, db);

    expect(result).toContain("mf1");
    expect(result).toContain("mf2");
  });

  it("非アクティブなアカウントは除外される", async () => {
    await createTestAccount({ mfId: "mf1", name: "Active", isActive: true });
    await createTestAccount({ mfId: "mf2", name: "Inactive", isActive: false });

    const result = await getAllAccountMfIds(undefined, db);

    expect(result).toEqual(["mf1"]);
  });

  it("グループがない場合は空配列を返す", async () => {
    await resetTestDb(db);
    const result = await getAllAccountMfIds(undefined, db);
    expect(result).toEqual([]);
  });
});

describe("getAccountByMfId", () => {
  it("mfIdでアカウントを取得する", async () => {
    const categoryId = await createCategory("銀行", 1);
    const accountId = await createTestAccount({
      mfId: "mf1",
      name: "Bank A",
      categoryId,
    });
    await createAccountStatus(accountId, {
      status: "ok",
      lastUpdated: "2025-04-15",
      totalAssets: 100000,
    });

    const result = await getAccountByMfId("mf1", undefined, db);

    expect(result).not.toBeNull();
    expect(result!.mfId).toBe("mf1");
    expect(result!.name).toBe("Bank A");
    expect(result!.totalAssets).toBe(100000);
  });

  it("存在しないmfIdの場合はnullを返す", async () => {
    await createTestAccount({ mfId: "mf1", name: "Bank A" });

    const result = await getAccountByMfId("mf_nonexistent", undefined, db);

    expect(result).toBeNull();
  });

  it("グループ外のアカウントはnullを返す", async () => {
    // グループに所属しないアカウントを作成
    const now = new Date().toISOString();
    await db
      .insert(schema.accounts)
      .values({
        mfId: "mf_outside",
        name: "Outside Account",
        type: "bank",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const result = await getAccountByMfId("mf_outside", undefined, db);

    expect(result).toBeNull();
  });

  it("nullフィールドにデフォルト値を適用する", async () => {
    await createTestAccount({ mfId: "mf1", name: "Bank A" });

    const result = await getAccountByMfId("mf1", undefined, db);

    expect(result!.status).toBe("ok");
    expect(result!.totalAssets).toBe(0);
    expect(result!.categoryName).toBe("未分類");
  });

  it("グループがない場合はnullを返す", async () => {
    await resetTestDb(db);
    const result = await getAccountByMfId("mf1", undefined, db);
    expect(result).toBeNull();
  });
});

describe("getAccountsGroupedByCategory", () => {
  it("カテゴリ別にグループ化されたアカウントを返す", async () => {
    const bankCategoryId = await createCategory("銀行", 1);
    const investmentCategoryId = await createCategory("証券", 2);

    const bankAccountId = await createTestAccount({
      mfId: "mf1",
      name: "Bank A",
      categoryId: bankCategoryId,
    });
    await createAccountStatus(bankAccountId, { totalAssets: 100000 });

    const investmentAccountId = await createTestAccount({
      mfId: "mf2",
      name: "Investment A",
      type: "investment",
      categoryId: investmentCategoryId,
    });
    await createAccountStatus(investmentAccountId, { totalAssets: 500000 });

    const result = await getAccountsGroupedByCategory(undefined, db);

    expect(result).toHaveLength(2);
    expect(result[0].categoryName).toBe("銀行");
    expect(result[0].accounts).toHaveLength(1);
    expect(result[1].categoryName).toBe("証券");
    expect(result[1].accounts).toHaveLength(1);
  });

  it("同じカテゴリ内でtotalAssets降順にソートされる", async () => {
    const categoryId = await createCategory("銀行", 1);

    const accountId1 = await createTestAccount({
      mfId: "mf1",
      name: "Bank A",
      categoryId,
    });
    await createAccountStatus(accountId1, { totalAssets: 100000 });

    const accountId2 = await createTestAccount({
      mfId: "mf2",
      name: "Bank B",
      categoryId,
    });
    await createAccountStatus(accountId2, { totalAssets: 500000 });

    const result = await getAccountsGroupedByCategory(undefined, db);

    expect(result[0].accounts[0].name).toBe("Bank B");
    expect(result[0].accounts[1].name).toBe("Bank A");
  });

  it("グループがない場合は空配列を返す", async () => {
    await resetTestDb(db);
    const result = await getAccountsGroupedByCategory(undefined, db);
    expect(result).toEqual([]);
  });
});
