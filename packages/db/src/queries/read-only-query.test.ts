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

  it("column list付きCTEを実行できる", async () => {
    await expect(
      executeReadOnlyQuery(
        db,
        "WITH totals(month, amount) AS (SELECT '2026-07', 100) SELECT * FROM totals",
        "",
        databasePath,
      ),
    ).resolves.toMatchObject({
      rows: [{ month: "2026-07", amount: 100 }],
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

  it("schema名と同じtable aliasを許可する", async () => {
    await expect(
      executeReadOnlyQuery(
        db,
        "SELECT source.description FROM transactions AS source",
        "group-a",
        databasePath,
      ),
    ).resolves.toMatchObject({
      rows: [{ description: "店舗 A" }],
    });
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
        `SELECT mf_id, account_id, transfer_target, transfer_target_account_id, is_internal_transfer
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
          is_internal_transfer: 0,
        },
      ],
    });
  });

  it("group境界transferでも両口座に共通groupがあれば内部振替として公開する", async () => {
    const now = new Date().toISOString();
    const accounts = await db.query.accounts.findMany();
    const selectedAccount = accounts.find(({ mfId }) => mfId === "account-a");
    const externalAccount = accounts.find(({ mfId }) => mfId === "account-b");
    if (!selectedAccount || !externalAccount) throw new Error("Test accounts were not created.");

    await db.insert(schema.groups).values({
      id: "group-c",
      name: "Group C",
      isCurrent: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.groupAccounts).values([
      {
        groupId: "group-c",
        accountId: selectedAccount.id,
        createdAt: now,
        updatedAt: now,
      },
      {
        groupId: "group-c",
        accountId: externalAccount.id,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.insert(schema.transactions).values({
      mfId: "internal-boundary-transfer",
      date: "2026-07-12",
      accountId: externalAccount.id,
      description: "Internal boundary transfer",
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
        `SELECT is_internal_transfer
         FROM transactions
         WHERE description = 'Internal boundary transfer'`,
        "group-a",
        databasePath,
      ),
    ).resolves.toMatchObject({
      rows: [{ is_internal_transfer: 1 }],
    });
  });

  it("外部振替相手をraw IDなしのstable keyで区別する", async () => {
    const now = new Date().toISOString();
    const accounts = await db.query.accounts.findMany();
    const selectedAccount = accounts.find(({ mfId }) => mfId === "account-a");
    const externalAccount = accounts.find(({ mfId }) => mfId === "account-b");
    if (!selectedAccount || !externalAccount) throw new Error("Test accounts were not created.");

    const anotherExternalAccount = await db
      .insert(schema.accounts)
      .values({
        mfId: "account-c",
        name: "Card C",
        type: "card",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    await db.insert(schema.transactions).values([
      {
        mfId: "outbound-transfer-a",
        date: "2026-07-12",
        accountId: selectedAccount.id,
        description: "Outbound transfer A",
        amount: 10_000,
        type: "transfer",
        isTransfer: true,
        transferTarget: "Card B",
        transferTargetAccountId: externalAccount.id,
        createdAt: now,
        updatedAt: now,
      },
      {
        mfId: "outbound-transfer-b",
        date: "2026-07-12",
        accountId: selectedAccount.id,
        description: "Outbound transfer B",
        amount: 10_000,
        type: "transfer",
        isTransfer: true,
        transferTarget: "Card C",
        transferTargetAccountId: anotherExternalAccount.id,
        createdAt: now,
        updatedAt: now,
      },
      {
        mfId: "outbound-transfer-a-duplicate",
        date: "2026-07-12",
        accountId: selectedAccount.id,
        description: "Outbound transfer A duplicate",
        amount: 10_000,
        type: "transfer",
        isTransfer: true,
        transferTarget: "Card B",
        transferTargetAccountId: externalAccount.id,
        createdAt: now,
        updatedAt: now,
      },
      {
        mfId: "inbound-transfer-a",
        date: "2026-07-12",
        accountId: externalAccount.id,
        description: "Inbound transfer A",
        amount: 10_000,
        type: "transfer",
        isTransfer: true,
        transferTarget: "Account A",
        transferTargetAccountId: selectedAccount.id,
        createdAt: now,
        updatedAt: now,
      },
      {
        mfId: "inbound-transfer-b",
        date: "2026-07-12",
        accountId: anotherExternalAccount.id,
        description: "Inbound transfer B",
        amount: 10_000,
        type: "transfer",
        isTransfer: true,
        transferTarget: "Account A",
        transferTargetAccountId: selectedAccount.id,
        createdAt: now,
        updatedAt: now,
      },
      {
        mfId: "inbound-transfer-a-duplicate",
        date: "2026-07-12",
        accountId: externalAccount.id,
        description: "Inbound transfer A duplicate",
        amount: 10_000,
        type: "transfer",
        isTransfer: true,
        transferTarget: "Account A",
        transferTargetAccountId: selectedAccount.id,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const result = await executeReadOnlyQuery(
      db,
      `SELECT transfer_target_account_id, transfer_counterparty_key
       FROM transactions
       WHERE description LIKE 'Outbound transfer%'
       ORDER BY description`,
      "group-a",
      databasePath,
    );
    const keys = result.rows.map(({ transfer_counterparty_key }) => transfer_counterparty_key);

    expect(
      result.rows.every(({ transfer_target_account_id }) => transfer_target_account_id === null),
    ).toBe(true);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(2);
    expect(keys[0]).toBe(keys[1]);
    expect(keys.every((key) => /^external:\d+$/.test(String(key)))).toBe(true);

    const inboundResult = await executeReadOnlyQuery(
      db,
      `SELECT account_id, transfer_counterparty_key
       FROM transactions
       WHERE description LIKE 'Inbound transfer%'
       ORDER BY description`,
      "group-a",
      databasePath,
    );
    const inboundKeys = inboundResult.rows.map(
      ({ transfer_counterparty_key }) => transfer_counterparty_key,
    );

    expect(inboundResult.rows.every(({ account_id }) => account_id === null)).toBe(true);
    expect(inboundKeys).toHaveLength(3);
    expect(new Set(inboundKeys).size).toBe(2);
    expect(inboundKeys[0]).toBe(inboundKeys[1]);
    expect(inboundKeys.every((key) => /^external:\d+$/.test(String(key)))).toBe(true);
  });

  it("endpoint口座IDが未解決の振替をsandboxから除外する", async () => {
    const now = new Date().toISOString();
    const selectedAccount = await db.query.accounts.findFirst({
      where: (accounts, { eq }) => eq(accounts.mfId, "account-a"),
    });
    if (!selectedAccount) throw new Error("Test account was not created.");

    await db.insert(schema.transactions).values([
      {
        mfId: "unresolved-outbound-transfer",
        date: "2026-07-12",
        accountId: selectedAccount.id,
        description: "Unresolved outbound transfer",
        amount: 10_000,
        type: "transfer",
        isTransfer: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        mfId: "unresolved-inbound-transfer",
        date: "2026-07-12",
        accountId: null,
        description: "Unresolved inbound transfer",
        amount: 10_000,
        type: "transfer",
        isTransfer: true,
        transferTarget: "Account A",
        transferTargetAccountId: selectedAccount.id,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await expect(
      executeReadOnlyQuery(
        db,
        `SELECT description
         FROM transactions
         WHERE description LIKE 'Unresolved % transfer'`,
        "group-a",
        databasePath,
      ),
    ).resolves.toMatchObject({ rows: [], rowCount: 0 });
  });

  it("選択groupの最新完了snapshotだけを保持しつつ外部group IDを匿名化する", async () => {
    const now = new Date().toISOString();
    const account = await db.query.accounts.findFirst({
      where: (accounts, { eq }) => eq(accounts.mfId, "account-a"),
    });
    if (!account) throw new Error("Test account was not created.");

    const oldHolding = await db
      .insert(schema.holdings)
      .values({
        mfId: "holding-a-old",
        accountId: account.id,
        name: "Asset A",
        type: "asset",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    const currentHolding = await db
      .insert(schema.holdings)
      .values({
        mfId: "holding-a-current",
        accountId: account.id,
        name: "Asset A",
        type: "asset",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    const incompleteHolding = await db
      .insert(schema.holdings)
      .values({
        mfId: "holding-a-incomplete",
        accountId: account.id,
        name: "Asset A",
        type: "asset",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    const selectedSnapshot = await db
      .insert(schema.dailySnapshots)
      .values({
        groupId: "group-a",
        date: "2026-07-11",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    const externalSnapshot = await db
      .insert(schema.dailySnapshots)
      .values({
        groupId: "group-b",
        date: "2026-07-12",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    const incompleteSnapshot = await db
      .insert(schema.dailySnapshots)
      .values({
        groupId: "group-a",
        date: "2026-07-13",
        refreshCompleted: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    await db.insert(schema.holdingValues).values([
      {
        holdingId: oldHolding.id,
        snapshotId: selectedSnapshot.id,
        amount: 10_000,
        createdAt: now,
        updatedAt: now,
      },
      {
        holdingId: currentHolding.id,
        snapshotId: externalSnapshot.id,
        amount: 20_000,
        createdAt: now,
        updatedAt: now,
      },
      {
        holdingId: incompleteHolding.id,
        snapshotId: incompleteSnapshot.id,
        amount: 30_000,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await expect(
      executeReadOnlyQuery(
        db,
        `SELECT ds.group_id, hv.amount
         FROM daily_snapshots ds
         JOIN holding_values hv ON hv.snapshot_id = ds.id
         ORDER BY hv.amount`,
        "group-a",
        databasePath,
      ),
    ).resolves.toMatchObject({
      rows: [{ group_id: "group-a", amount: 20_000 }],
      rowCount: 1,
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

  it("computed cellがSQLite heap上限を超える前にqueryを中断する", async () => {
    const commonTableExpressions = ["value_0(value) AS (SELECT 'x')"];
    for (let index = 1; index <= 27; index += 1) {
      commonTableExpressions.push(
        `value_${index}(value) AS (
          SELECT value || value FROM value_${index - 1}
        )`,
      );
    }

    await expect(
      executeReadOnlyQuery(
        db,
        `WITH ${commonTableExpressions.join(",")}
         SELECT value FROM value_27`,
        "group-a",
        databasePath,
      ),
    ).rejects.toThrow(/memory|上限/);
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

  it.each([
    "SELECT readfile('/etc/hosts')",
    "SELECT writefile('/tmp/output', 'content')",
    "SELECT load_extension('/tmp/extension')",
  ])("filesystemへアクセスするSQL関数を拒否する: %s", (sql) => {
    expect(() => normalizeReadOnlySql(sql)).toThrow(
      "filesystemへアクセスするSQL関数は使用できません。",
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

  it("末尾コメント前のstatement terminatorを除去する", () => {
    expect(normalizeReadOnlySql("SELECT 1; -- explanation")).toBe("SELECT 1 -- explanation");
  });

  it("文字列内のschema風テキストを許可する", () => {
    expect(normalizeReadOnlySql("SELECT 'main.transactions' AS text")).toBe(
      "SELECT 'main.transactions' AS text",
    );
  });
});
