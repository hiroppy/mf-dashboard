import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { schema } from "../index";
import { closeTestDb, createTestDb, resetTestDb } from "../test-helpers";
import { executeReadOnlyQuery, normalizeReadOnlySql } from "./read-only-query";

type Db = Awaited<ReturnType<typeof createTestDb>>;
let db: Db;
let databasePath: string;
let temporaryDirectory: string;

beforeAll(async () => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "mf-dashboard-read-only-query-"));
  databasePath = join(temporaryDirectory, "test.db");
  db = await createTestDb(`file:${databasePath}`);
});

afterAll(() => {
  closeTestDb(db);
  rmSync(temporaryDirectory, { recursive: true });
});

beforeEach(async () => {
  await resetTestDb(db);
  const now = new Date().toISOString();
  await db.insert(schema.groups).values({
    id: "group-a",
    name: "Group A",
    isCurrent: true,
    createdAt: now,
    updatedAt: now,
  });
  const account = await db
    .insert(schema.accounts)
    .values({
      mfId: "account-a",
      name: "Card A",
      type: "card",
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  await db.insert(schema.groupAccounts).values({
    groupId: "group-a",
    accountId: account.id,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(schema.transactions).values({
    mfId: "transaction-a",
    date: "2026-07-10",
    accountId: account.id,
    category: "食費",
    subCategory: "外食",
    description: "店舗 A",
    amount: 3_000,
    type: "expense",
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(schema.groups).values({
    id: "group-b",
    name: "Group B",
    isCurrent: false,
    createdAt: now,
    updatedAt: now,
  });
  const otherAccount = await db
    .insert(schema.accounts)
    .values({
      mfId: "account-b",
      name: "Card B",
      type: "card",
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  await db.insert(schema.groupAccounts).values({
    groupId: "group-b",
    accountId: otherAccount.id,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(schema.transactions).values({
    mfId: "transaction-b",
    date: "2026-07-11",
    accountId: otherAccount.id,
    category: "交通費",
    subCategory: "鉄道",
    description: "店舗 B",
    amount: 5_000,
    type: "expense",
    createdAt: now,
    updatedAt: now,
  });
});

describe("executeReadOnlyQuery", () => {
  it("bindしたgroupIdを使う自由なSELECTを実行する", async () => {
    const result = await executeReadOnlyQuery(
      db,
      `SELECT t.description, t.amount
       FROM transactions t
       JOIN group_accounts ga ON ga.account_id = t.account_id
       WHERE ga.group_id = :groupId AND t.category = '食費'
      ORDER BY t.amount DESC`,
      "group-a",
      databasePath,
    );

    expect(result).toEqual({
      columns: ["description", "amount"],
      rows: [{ description: "店舗 A", amount: 3_000 }],
      rowCount: 1,
      truncated: false,
    });
  });

  it("group filterのないSQLもserver-side viewで現在groupへ限定する", async () => {
    await expect(
      executeReadOnlyQuery(
        db,
        "SELECT description, amount FROM transactions ORDER BY amount DESC",
        "group-a",
        databasePath,
      ),
    ).resolves.toMatchObject({
      rows: [{ description: "店舗 A", amount: 3_000 }],
      rowCount: 1,
      truncated: false,
    });
  });

  it("groupIdを必要としないSELECTとCTEも実行できる", async () => {
    await expect(
      executeReadOnlyQuery(
        db,
        "WITH value AS (SELECT 'delete' AS text) SELECT text FROM value",
        "",
        databasePath,
      ),
    ).resolves.toEqual({
      columns: ["text"],
      rows: [{ text: "delete" }],
      rowCount: 1,
      truncated: false,
    });
  });

  it("末尾の行コメントを外側のLIMITで壊さない", async () => {
    await expect(
      executeReadOnlyQuery(db, "SELECT 1 AS value -- explanation", "", databasePath),
    ).resolves.toEqual({
      columns: ["value"],
      rows: [{ value: 1 }],
      rowCount: 1,
      truncated: false,
    });
  });

  it("重複した結果列名を保持できるよう自動で区別する", async () => {
    await expect(
      executeReadOnlyQuery(db, "SELECT 1 AS id, 2 AS id", "", databasePath),
    ).resolves.toEqual({
      columns: ["id", "id:1"],
      rows: [{ id: 1, "id:1": 2 }],
      rowCount: 1,
      truncated: false,
    });
  });

  it("main schemaを指定したgroup viewの迂回を拒否する", async () => {
    await expect(
      executeReadOnlyQuery(db, "SELECT * FROM main.transactions", "group-a", databasePath),
    ).rejects.toThrow("データベースschemaを直接指定するSQLは実行できません。");
  });

  it("group境界transferの外部account情報とraw IDを匿名化する", async () => {
    const now = new Date().toISOString();
    const accounts = await db.query.accounts.findMany();
    const selectedAccount = accounts.find(({ mfId }) => mfId === "account-a");
    const externalAccount = accounts.find(({ mfId }) => mfId === "account-b");
    if (!selectedAccount || !externalAccount) throw new Error("Test accounts were not created.");

    await db.insert(schema.transactions).values({
      mfId: "boundary-transfer",
      date: "2026-07-12",
      accountId: externalAccount.id,
      description: "Boundary transfer",
      amount: 10_000,
      type: "transfer",
      isTransfer: true,
      transferTarget: "Card A",
      transferTargetAccountId: selectedAccount.id,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      executeReadOnlyQuery(
        db,
        `SELECT mf_id, account_id, transfer_target, transfer_target_account_id
         FROM transactions
         WHERE description = 'Boundary transfer'`,
        "group-a",
        databasePath,
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          mf_id: null,
          account_id: null,
          transfer_target: "Card A",
          transfer_target_account_id: selectedAccount.id,
        },
      ],
    });
  });

  it("schema外のtableを拒否する", async () => {
    await expect(
      executeReadOnlyQuery(db, "SELECT name FROM sqlite_master", "group-a", databasePath),
    ).rejects.toThrow("許可されていないテーブル sqlite_master は参照できません。");
  });

  it("serialized resultがbyte budgetを超えた時点で打ち切る", async () => {
    await db
      .update(schema.transactions)
      .set({ description: "x".repeat(40_000) })
      .where(eq(schema.transactions.mfId, "transaction-a"))
      .run();

    await expect(
      executeReadOnlyQuery(
        db,
        "SELECT description || description AS value FROM transactions",
        "group-a",
        databasePath,
      ),
    ).resolves.toEqual({
      columns: ["value"],
      rows: [],
      rowCount: 0,
      truncated: true,
    });
  });

  it("execution deadlineで高コストqueryを中断する", async () => {
    const now = new Date().toISOString();
    const account = await db.query.accounts.findFirst({
      where: (accounts, { eq }) => eq(accounts.mfId, "account-a"),
    });
    if (!account) throw new Error("Test account was not created.");

    await db.insert(schema.transactions).values(
      Array.from({ length: 249 }, (_, index) => ({
        mfId: `timeout-transaction-${index}`,
        date: "2026-07-12",
        accountId: account.id,
        description: `Test transaction ${index}`,
        amount: index + 1,
        type: "expense",
        createdAt: now,
        updatedAt: now,
      })),
    );

    await expect(
      executeReadOnlyQuery(
        db,
        `SELECT COUNT(*) AS count
         FROM transactions a
         JOIN transactions b ON 1 = 1
         JOIN transactions c ON 1 = 1
         JOIN transactions d ON 1 = 1`,
        "group-a",
        databasePath,
      ),
    ).rejects.toThrow("SQLの実行時間が上限を超えました。");
  });
});

describe("normalizeReadOnlySql", () => {
  it.each([
    "INSERT INTO groups (id) VALUES ('x')",
    "UPDATE groups SET name = 'x'",
    "DELETE FROM groups",
    "DROP TABLE groups",
    "WITH value AS (SELECT 1) DELETE FROM groups",
    "PRAGMA table_info(groups)",
  ])("書き込みまたは管理SQLを拒否する: %s", (sql) => {
    expect(() => normalizeReadOnlySql(sql)).toThrow(/read-only SQL|データを変更/);
  });

  it("複数ステートメントを拒否する", () => {
    expect(() => normalizeReadOnlySql("SELECT 1; SELECT 2")).toThrow(
      "一度に実行できるSQLは1文だけです。",
    );
  });

  it("長すぎるSQLを拒否する", () => {
    expect(() => normalizeReadOnlySql(`SELECT '${"x".repeat(5_000)}'`)).toThrow(
      "SQLは5000文字以内で指定してください。",
    );
  });

  it("文字列とコメント内の禁止語はSQL操作として扱わない", () => {
    expect(normalizeReadOnlySql("/* delete */ SELECT 'update' AS text;")).toBe(
      "/* delete */ SELECT 'update' AS text",
    );
  });
});
