import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { schema } from "../index";
import { createTestDb, resetTestDb, closeTestDb } from "../test-helpers";
import {
  getTransactions,
  getTransactionsByMonth,
  getTransactionsByAccountId,
  SEARCH_TRANSACTIONS_DEFAULT_LIMIT,
  SEARCH_TRANSACTIONS_MAX_LIMIT,
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

async function createExternalAccount(name: string): Promise<number> {
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

  return account.id;
}

async function addAccountToGroup(accountId: number, groupId: string) {
  const now = new Date().toISOString();
  await db
    .insert(schema.groupAccounts)
    .values({ groupId, accountId, createdAt: now, updatedAt: now })
    .run();
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

  it("対象groupへの外部口座振替を支出として検索する", async () => {
    const targetAccountId = await createTestAccount("Bank A");
    const now = new Date().toISOString();
    const sourceAccount = await db
      .insert(schema.accounts)
      .values({
        mfId: "external_source",
        name: "External Source",
        type: "bank",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    await createTransaction({
      accountId: sourceAccount.id,
      date: "2025-06-06",
      amount: 6000,
      type: "transfer",
      transferTargetAccountId: targetAccountId,
    });

    const result = await searchTransactions(
      { groupId: TEST_GROUP_ID, type: "expense", includeTransfers: false },
      db,
    );

    expect(result).toEqual([
      expect.objectContaining({
        accountId: targetAccountId,
        accountName: "Bank A",
        amount: 6000,
        type: "expense",
        category: "支出",
        subCategory: "振替出金",
        isTransfer: false,
        isExcludedFromCalculation: false,
      }),
    ]);
    expect(result.every(({ accountId }) => accountId === targetAccountId)).toBe(true);
  });

  it("通常明細と重複する対象groupへの振替支出を除外する", async () => {
    const targetAccountId = await createTestAccount("Bank A");
    const sourceAccountId = await createExternalAccount("External Bank");

    await createTransaction({
      accountId: sourceAccountId,
      date: "2025-06-06",
      amount: 6000,
      type: "transfer",
      transferTargetAccountId: targetAccountId,
    });
    await createTransaction({
      accountId: targetAccountId,
      date: "2025-06-06",
      amount: 6000,
      type: "expense",
    });

    const result = await searchTransactions(
      { groupId: TEST_GROUP_ID, type: "expense", includeTransfers: false },
      db,
    );

    expect(result).toEqual([
      expect.objectContaining({ accountId: targetAccountId, amount: 6000, type: "expense" }),
    ]);
  });

  it("同額の通常収入があっても対象groupへの振替支出を保持する", async () => {
    const targetAccountId = await createTestAccount("Bank A");
    const sourceAccountId = await createExternalAccount("External Bank");

    await createTransaction({
      accountId: sourceAccountId,
      date: "2025-06-06",
      amount: 6000,
      type: "transfer",
      transferTargetAccountId: targetAccountId,
    });
    await createTransaction({
      accountId: targetAccountId,
      date: "2025-06-06",
      amount: 6000,
      type: "income",
    });

    const result = await searchTransactions({ groupId: TEST_GROUP_ID, type: "expense" }, db);

    expect(result).toEqual([
      expect.objectContaining({ accountId: targetAccountId, amount: 6000, type: "expense" }),
    ]);
  });

  it("同日同額の対象groupからの振替収入を別取引として返す", async () => {
    const sourceAccountId = await createTestAccount("Bank A");
    const targetAccountId = await createExternalAccount("External Bank");

    for (let index = 0; index < 2; index += 1) {
      await createTransaction({
        accountId: sourceAccountId,
        date: "2025-06-06",
        amount: 6000,
        type: "transfer",
        transferTargetAccountId: targetAccountId,
      });
    }

    const result = await searchTransactions({ groupId: TEST_GROUP_ID, type: "income" }, db);

    expect(result).toHaveLength(2);
    expect(
      result.every(
        (transaction) =>
          transaction.accountId === sourceAccountId &&
          transaction.amount === 6000 &&
          transaction.type === "income",
      ),
    ).toBe(true);
  });

  it("通常収入と重複する対象groupからの振替収入を除外する", async () => {
    const sourceAccountId = await createTestAccount("Bank A");
    const targetAccountId = await createExternalAccount("External Bank");

    await createTransaction({
      accountId: sourceAccountId,
      date: "2025-06-06",
      amount: 6000,
      type: "transfer",
      transferTargetAccountId: targetAccountId,
    });
    await createTransaction({
      accountId: sourceAccountId,
      date: "2025-06-06",
      amount: 6000,
      type: "income",
    });

    const result = await searchTransactions({ groupId: TEST_GROUP_ID, type: "income" }, db);

    expect(result).toEqual([
      expect.objectContaining({ accountId: sourceAccountId, amount: 6000, type: "income" }),
    ]);
  });

  it("同額の通常支出があっても対象groupからの振替収入を保持する", async () => {
    const sourceAccountId = await createTestAccount("Bank A");
    const targetAccountId = await createExternalAccount("External Bank");

    await createTransaction({
      accountId: sourceAccountId,
      date: "2025-06-06",
      amount: 6000,
      type: "transfer",
      transferTargetAccountId: targetAccountId,
    });
    await createTransaction({
      accountId: sourceAccountId,
      date: "2025-06-06",
      amount: 6000,
      type: "expense",
    });

    const result = await searchTransactions({ groupId: TEST_GROUP_ID, type: "income" }, db);

    expect(result).toEqual([
      expect.objectContaining({ accountId: sourceAccountId, amount: 6000, type: "income" }),
    ]);
  });

  it("共通groupを持つ外部口座から対象groupへの振替を支出へ変換しない", async () => {
    const targetAccountId = await createTestAccount("Bank A");
    const commonGroupId = "common_group";
    const now = new Date().toISOString();
    await db
      .insert(schema.groups)
      .values({
        id: commonGroupId,
        name: "Common Group",
        isCurrent: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const sourceAccountId = await createTestAccount("External Bank", commonGroupId);
    await addAccountToGroup(targetAccountId, commonGroupId);
    await createTransaction({
      accountId: sourceAccountId,
      date: "2025-06-06",
      amount: 6000,
      type: "transfer",
      transferTargetAccountId: targetAccountId,
    });

    expect(await searchTransactions({ groupId: TEST_GROUP_ID, type: "expense" }, db)).toEqual([]);
    expect(await searchTransactions({ groupId: TEST_GROUP_ID, type: "transfer" }, db)).toEqual([
      expect.objectContaining({ accountId: sourceAccountId, amount: 6000, type: "transfer" }),
    ]);
  });

  it("別の共通group内の振替を収入へ変換しない", async () => {
    const sourceAccountId = await createTestAccount("Bank A");
    const commonGroupId = "common_group";
    const now = new Date().toISOString();
    await db
      .insert(schema.groups)
      .values({
        id: commonGroupId,
        name: "Common Group",
        isCurrent: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const targetAccountId = await createTestAccount("Bank B", commonGroupId);
    await addAccountToGroup(sourceAccountId, commonGroupId);
    await createTransaction({
      accountId: sourceAccountId,
      date: "2025-06-07",
      amount: 7000,
      type: "transfer",
      transferTargetAccountId: targetAccountId,
    });

    expect(await searchTransactions({ groupId: TEST_GROUP_ID, type: "income" }, db)).toEqual([]);
    expect(await searchTransactions({ groupId: TEST_GROUP_ID, type: "transfer" }, db)).toEqual([
      expect.objectContaining({ amount: 7000, type: "transfer", isTransfer: true }),
    ]);
  });

  it("既定件数と最大件数で結果を制限しoffsetを適用する", async () => {
    const accountId = await createTestAccount("Card A");
    for (let day = 0; day <= SEARCH_TRANSACTIONS_MAX_LIMIT; day += 1) {
      await createTransaction({
        accountId,
        date: `2025-06-${String((day % 28) + 1).padStart(2, "0")}`,
        amount: day,
        type: "expense",
      });
    }

    const defaultResult = await searchTransactions({ groupId: TEST_GROUP_ID }, db);
    const cappedResult = await searchTransactions(
      { groupId: TEST_GROUP_ID, limit: SEARCH_TRANSACTIONS_MAX_LIMIT + 1 },
      db,
    );
    const offsetResult = await searchTransactions(
      { groupId: TEST_GROUP_ID, limit: 1, offset: 1 },
      db,
    );

    expect(defaultResult).toHaveLength(SEARCH_TRANSACTIONS_DEFAULT_LIMIT);
    expect(cappedResult).toHaveLength(SEARCH_TRANSACTIONS_MAX_LIMIT);
    expect(offsetResult).toEqual([cappedResult[1]]);
  });

  it("取得batchより後の一致結果も検索する", async () => {
    const accountId = await createTestAccount("Card A");
    await createTransaction({
      accountId,
      date: "2025-05-01",
      amount: 5000,
      type: "expense",
      category: "食費",
    });
    for (let day = 0; day < SEARCH_TRANSACTIONS_DEFAULT_LIMIT; day += 1) {
      await createTransaction({
        accountId,
        date: `2025-06-${String((day % 28) + 1).padStart(2, "0")}`,
        amount: day,
        type: "expense",
        category: "交通費",
      });
    }

    expect(await searchTransactions({ groupId: TEST_GROUP_ID, category: "食費" }, db)).toEqual([
      expect.objectContaining({ amount: 5000, category: "食費" }),
    ]);
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
