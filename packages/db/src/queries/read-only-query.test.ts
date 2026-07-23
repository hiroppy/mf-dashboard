import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { schema } from "../index";
import { closeTestDb, createTestDb, resetTestDb } from "../test-helpers";
import { executeReadOnlyQuery, normalizeReadOnlySql } from "./read-only-query";

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
    );

    expect(result).toEqual({
      columns: ["description", "amount"],
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
      ),
    ).resolves.toEqual({
      columns: ["text"],
      rows: [{ text: "delete" }],
      rowCount: 1,
      truncated: false,
    });
  });

  it("末尾の行コメントを外側のLIMITで壊さない", async () => {
    await expect(executeReadOnlyQuery(db, "SELECT 1 AS value -- explanation", "")).resolves.toEqual(
      {
        columns: ["value"],
        rows: [{ value: 1 }],
        rowCount: 1,
        truncated: false,
      },
    );
  });

  it("重複した結果列名を保持できるよう自動で区別する", async () => {
    await expect(executeReadOnlyQuery(db, "SELECT 1 AS id, 2 AS id", "")).resolves.toEqual({
      columns: ["id", "id:1"],
      rows: [{ id: 1, "id:1": 2 }],
      rowCount: 1,
      truncated: false,
    });
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

  it("文字列とコメント内の禁止語はSQL操作として扱わない", () => {
    expect(normalizeReadOnlySql("/* delete */ SELECT 'update' AS text;")).toBe(
      "/* delete */ SELECT 'update' AS text",
    );
  });
});
