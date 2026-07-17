import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { schema } from "../index";
import { createTestDb, resetTestDb, closeTestDb } from "../test-helpers";
import {
  getTransactions,
  getTransactionsByMonth,
  getTransactionsByAccountId,
  searchTransactions,
} from "./transaction";

type Db = Awaited<ReturnType<typeof createTestDb>>;
let db: Db;

const TEST_GROUP_ID = "test_group_001";

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(() => {
  closeTestDb(db);
});

beforeEach(async () => {
  await resetTestDb(db);
  // Setup test group
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
});

async function createTestAccount(name: string, groupId = TEST_GROUP_ID): Promise<number> {
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
      groupId,
      accountId: account.id,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return account.id;
}

async function createTransaction(data: {
  accountId: number;
  date: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  category?: string;
  subCategory?: string;
  description?: string;
  isExcludedFromCalculation?: boolean;
  transferTargetAccountId?: number;
}) {
  const now = new Date().toISOString();
  await db
    .insert(schema.transactions)
    .values({
      mfId: `tx_${Date.now()}_${Math.random()}`,
      date: data.date,
      accountId: data.accountId,
      category: data.category ?? null,
      subCategory: data.subCategory ?? null,
      description: data.description ?? "Test transaction",
      amount: data.amount,
      type: data.type,
      isTransfer: data.type === "transfer",
      isExcludedFromCalculation: data.isExcludedFromCalculation ?? data.type === "transfer",
      transferTargetAccountId: data.transferTargetAccountId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

describe("searchTransactions", () => {
  it("日付・期間・月を境界日を含めて検索する", async () => {
    const accountId = await createTestAccount("Bank A");
    await createTransaction({ accountId, date: "2025-05-31", amount: 1000, type: "expense" });
    await createTransaction({ accountId, date: "2025-06-01", amount: 2000, type: "expense" });
    await createTransaction({ accountId, date: "2025-06-10", amount: 3000, type: "expense" });
    await createTransaction({ accountId, date: "2025-06-30", amount: 4000, type: "expense" });
    await createTransaction({ accountId, date: "2025-07-01", amount: 5000, type: "expense" });

    const byDate = await searchTransactions({ groupId: TEST_GROUP_ID, date: "2025-06-10" }, db);
    const byPeriod = await searchTransactions(
      { groupId: TEST_GROUP_ID, startDate: "2025-06-01", endDate: "2025-06-30" },
      db,
    );
    const byMonth = await searchTransactions({ groupId: TEST_GROUP_ID, month: "2025-06" }, db);

    expect(byDate.map((transaction) => transaction.date)).toEqual(["2025-06-10"]);
    expect(byPeriod.map((transaction) => transaction.date)).toEqual([
      "2025-06-30",
      "2025-06-10",
      "2025-06-01",
    ]);
    expect(byMonth.map((transaction) => transaction.date)).toEqual([
      "2025-06-30",
      "2025-06-10",
      "2025-06-01",
    ]);
  });

  it("カテゴリ・サブカテゴリ・キーワードで検索する", async () => {
    const accountId = await createTestAccount("Card A");
    await createTransaction({
      accountId,
      date: "2025-06-10",
      amount: 3200,
      type: "expense",
      category: "食費",
      subCategory: "食料品",
      description: "Amazon Fresh",
    });
    await createTransaction({
      accountId,
      date: "2025-06-11",
      amount: 800,
      type: "expense",
      category: "交通費",
      subCategory: "電車",
      description: "IC charge",
    });

    expect(await searchTransactions({ groupId: TEST_GROUP_ID, category: "食費" }, db)).toHaveLength(
      1,
    );
    expect(
      await searchTransactions({ groupId: TEST_GROUP_ID, subCategory: "電車" }, db),
    ).toHaveLength(1);
    expect(await searchTransactions({ groupId: TEST_GROUP_ID, keyword: "amazon" }, db)).toEqual([
      expect.objectContaining({
        date: "2025-06-10",
        category: "食費",
        subCategory: "食料品",
        description: "Amazon Fresh",
        amount: 3200,
        type: "expense",
        accountId,
        accountName: "Card A",
      }),
    ]);
    expect(await searchTransactions({ groupId: TEST_GROUP_ID, keyword: "食料" }, db)).toHaveLength(
      1,
    );
  });

  it("金額の最小値と最大値を包含境界として検索する", async () => {
    const accountId = await createTestAccount("Card A");
    await createTransaction({ accountId, date: "2025-06-01", amount: 9999, type: "expense" });
    await createTransaction({ accountId, date: "2025-06-02", amount: 10000, type: "expense" });
    await createTransaction({ accountId, date: "2025-06-03", amount: 20000, type: "expense" });
    await createTransaction({ accountId, date: "2025-06-04", amount: 20001, type: "expense" });

    const result = await searchTransactions(
      { groupId: TEST_GROUP_ID, minAmount: 10000, maxAmount: 20000 },
      db,
    );

    expect(result.map((transaction) => transaction.amount)).toEqual([20000, 10000]);
  });

  it("種別・振替・計算対象外を既存の振替変換後の状態で絞り込む", async () => {
    const accountId = await createTestAccount("Bank A");
    const internalAccountId = await createTestAccount("Bank B");
    const now = new Date().toISOString();
    const externalAccount = await db
      .insert(schema.accounts)
      .values({
        mfId: "external_search",
        name: "External Account",
        type: "bank",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    await createTransaction({ accountId, date: "2025-06-01", amount: 1000, type: "income" });
    await createTransaction({ accountId, date: "2025-06-02", amount: 2000, type: "expense" });
    await createTransaction({
      accountId,
      date: "2025-06-03",
      amount: 3000,
      type: "expense",
      isExcludedFromCalculation: true,
    });
    await createTransaction({
      accountId,
      date: "2025-06-04",
      amount: 4000,
      type: "transfer",
      transferTargetAccountId: internalAccountId,
    });
    await createTransaction({
      accountId,
      date: "2025-06-05",
      amount: 5000,
      type: "transfer",
      transferTargetAccountId: externalAccount.id,
    });

    const incomes = await searchTransactions(
      { groupId: TEST_GROUP_ID, type: "income", includeTransfers: false },
      db,
    );
    const expenses = await searchTransactions(
      { groupId: TEST_GROUP_ID, type: "expense", includeExcluded: false },
      db,
    );
    const transfers = await searchTransactions(
      { groupId: TEST_GROUP_ID, type: "transfer", includeExcluded: true },
      db,
    );
    const transformedCategory = await searchTransactions(
      { groupId: TEST_GROUP_ID, category: "収入" },
      db,
    );

    expect(incomes.map((transaction) => transaction.amount)).toEqual([5000, 1000]);
    expect(incomes[0]).toEqual(
      expect.objectContaining({
        category: "収入",
        subCategory: "振替入金",
        isTransfer: false,
        isExcludedFromCalculation: false,
      }),
    );
    expect(expenses.map((transaction) => transaction.amount)).toEqual([2000]);
    expect(transfers.map((transaction) => transaction.amount)).toEqual([4000]);
    expect(transformedCategory.map((transaction) => transaction.amount)).toEqual([5000]);
    expect(
      await searchTransactions({ groupId: TEST_GROUP_ID, includeTransfers: false }, db),
    ).toHaveLength(4);
  });

  it("明示されたgroupIdのアカウントだけを検索する", async () => {
    const now = new Date().toISOString();
    const otherGroupId = "test_group_002";
    await db
      .insert(schema.groups)
      .values({
        id: otherGroupId,
        name: "Test Group B",
        isCurrent: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const accountId = await createTestAccount("Bank A");
    const otherAccountId = await createTestAccount("Bank B", otherGroupId);
    await createTransaction({ accountId, date: "2025-06-10", amount: 1000, type: "expense" });
    await createTransaction({
      accountId: otherAccountId,
      date: "2025-06-10",
      amount: 2000,
      type: "expense",
    });

    expect(
      (await searchTransactions({ groupId: TEST_GROUP_ID }, db)).map(
        (transaction) => transaction.amount,
      ),
    ).toEqual([1000]);
    expect(
      (await searchTransactions({ groupId: otherGroupId }, db)).map(
        (transaction) => transaction.amount,
      ),
    ).toEqual([2000]);
    expect(await searchTransactions({ groupId: "missing_group" }, db)).toEqual([]);
  });

  it("複数条件をANDで組み合わせる", async () => {
    const accountId = await createTestAccount("Card A");
    await createTransaction({
      accountId,
      date: "2025-06-10",
      amount: 12000,
      type: "expense",
      category: "食費",
      description: "Amazon Fresh",
    });
    await createTransaction({
      accountId,
      date: "2025-06-11",
      amount: 8000,
      type: "expense",
      category: "食費",
      description: "Amazon Fresh",
    });

    const result = await searchTransactions(
      {
        groupId: TEST_GROUP_ID,
        month: "2025-06",
        category: "食費",
        keyword: "Amazon",
        minAmount: 10000,
        type: "expense",
        includeTransfers: false,
        includeExcluded: false,
      },
      db,
    );

    expect(result.map((transaction) => transaction.amount)).toEqual([12000]);
  });
});

describe("getTransactions", () => {
  it("トランザクション一覧を返す", async () => {
    const accountId = await createTestAccount("Bank A");
    await createTransaction({
      accountId,
      date: "2025-04-15",
      amount: 3000,
      type: "expense",
      category: "食費",
    });
    await createTransaction({
      accountId,
      date: "2025-04-14",
      amount: 500000,
      type: "income",
      category: "給与",
    });

    const result = await getTransactions(undefined, db);

    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2025-04-15");
    expect(result[1].date).toBe("2025-04-14");
  });

  it("limitを指定した場合は件数が制限される", async () => {
    const accountId = await createTestAccount("Bank A");
    await createTransaction({ accountId, date: "2025-04-15", amount: 1000, type: "expense" });
    await createTransaction({ accountId, date: "2025-04-14", amount: 2000, type: "expense" });

    const result = await getTransactions({ limit: 1 }, db);

    expect(result).toHaveLength(1);
  });

  it("グループがない場合は空配列を返す", async () => {
    await resetTestDb(db);
    expect(await getTransactions(undefined, db)).toEqual([]);
  });
});

describe("getTransactionsByMonth", () => {
  it("指定月のトランザクションを返す", async () => {
    const accountId = await createTestAccount("Bank A");
    await createTransaction({
      accountId,
      date: "2025-04-15",
      amount: 3000,
      type: "expense",
      category: "食費",
    });
    await createTransaction({
      accountId,
      date: "2025-05-01",
      amount: 5000,
      type: "expense",
      category: "交通費",
    });

    const result = await getTransactionsByMonth("2025-04", undefined, db);

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2025-04-15");
  });

  it("該当月にデータがない場合は空配列を返す", async () => {
    const accountId = await createTestAccount("Bank A");
    await createTransaction({ accountId, date: "2025-04-15", amount: 3000, type: "expense" });

    expect(await getTransactionsByMonth("2099-01", undefined, db)).toEqual([]);
  });

  describe("振替トランザクションの収入変換", () => {
    it("グループ外アカウントからの振替は収入として扱われる", async () => {
      const accountId = await createTestAccount("Bank A");
      const now = new Date().toISOString();
      const externalAccount = await db
        .insert(schema.accounts)
        .values({
          mfId: "external",
          name: "External Account",
          type: "bank",
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      await createTransaction({
        accountId,
        date: "2025-04-15",
        amount: 100000,
        type: "transfer",
        transferTargetAccountId: externalAccount.id,
      });

      const result = await getTransactionsByMonth("2025-04", undefined, db);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("income");
      expect(result[0].category).toBe("収入");
      expect(result[0].subCategory).toBe("振替入金");
    });

    it("グループ内アカウント間の振替はそのまま振替として返される", async () => {
      const accountId1 = await createTestAccount("Bank A");
      const accountId2 = await createTestAccount("Bank B");

      await createTransaction({
        accountId: accountId1,
        date: "2025-04-15",
        amount: 50000,
        type: "transfer",
        transferTargetAccountId: accountId2,
      });

      const result = await getTransactionsByMonth("2025-04", undefined, db);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("transfer");
    });
  });
});

describe("getTransactionsByAccountId", () => {
  it("現在のグループに所属するアカウントのトランザクションを取得できる", async () => {
    const accountId = await createTestAccount("Bank A");
    await createTransaction({ accountId, date: "2025-04-15", amount: 3000, type: "expense" });

    const result = await getTransactionsByAccountId(accountId, undefined, db);

    expect(result).toHaveLength(1);
  });

  it("他のグループのアカウントは空配列を返す", async () => {
    const accountId = await createTestAccount("Bank A");
    await createTransaction({ accountId, date: "2025-04-15", amount: 3000, type: "expense" });

    expect(await getTransactionsByAccountId(9999, undefined, db)).toEqual([]);
  });
});
