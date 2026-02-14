import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { schema } from "../index";
import { createTestDb, resetTestDb, closeTestDb } from "../test-helpers";
import { getTransactions, getTransactionsByMonth, getTransactionsByAccountId } from "./transaction";

type Db = ReturnType<typeof createTestDb>;
let db: Db;

const TEST_GROUP_ID = "test_group_001";

beforeAll(() => {
  db = createTestDb();
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

async function createTransaction(data: {
  accountId: number;
  date: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  category?: string;
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
      subCategory: null,
      description: "Test transaction",
      amount: data.amount,
      type: data.type,
      isTransfer: data.type === "transfer",
      isExcludedFromCalculation: data.type === "transfer",
      transferTargetAccountId: data.transferTargetAccountId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

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
