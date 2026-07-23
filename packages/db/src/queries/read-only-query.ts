import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
import { getTableColumns, getTableName, isTable } from "drizzle-orm";
import { getDbPath } from "../db-path";
import type { Db } from "../index";
import * as schema from "../schema/schema";

export const READ_ONLY_QUERY_MAX_ROWS = 200;
export const READ_ONLY_QUERY_MAX_BYTES = 64 * 1024;
export const READ_ONLY_QUERY_TIMEOUT_MS = 1_000;
export const READ_ONLY_QUERY_MAX_SQL_LENGTH = 5_000;

const MAX_RESULT_COLUMNS = 32;
const MAX_JOIN_COUNT = 8;
const MAX_UNION_COUNT = 8;

const WRITE_KEYWORDS =
  /\b(?:alter|analyze|attach|create|delete|detach|drop|insert|pragma|reindex|release|replace|rollback|savepoint|update|vacuum)\b/i;
const EXPENSIVE_SQL =
  /\b(?:cross\s+join|group_concat|hex|json_group_array|json_group_object|printf|randomblob|zeroblob|with\s+recursive)\b/i;
const SCHEMA_QUALIFIER = /(?:\b(?:main|source|temp)\b|["'`[](?:main|source|temp)["'`\]])\s*\./i;

const TABLE_NAMES = (Object.values(schema) as unknown[]).filter(isTable).map(getTableName);

const TABLE_NAME_SET = new Set(TABLE_NAMES);
const libsqlModulePath = createRequire(import.meta.url).resolve("libsql/promise");

const QUERY_WORKER_SOURCE = String.raw`
  const { parentPort, workerData } = require("node:worker_threads");
  const Database = require(workerData.libsqlModulePath);

  function serializeValue(value) {
    return value instanceof Uint8Array ? Array.from(value) : value;
  }

  async function run() {
    const database = new Database(":memory:", {});

    try {
      await database.exec(workerData.scopedDatabaseSql);
      const statement = await database.prepare(
        "SELECT * FROM (\n" + workerData.query + "\n) AS query_result LIMIT " +
          (workerData.maxRows + 1),
      );
      const columns = statement.columns().map((column) => column.name);
      if (columns.length > workerData.maxColumns) {
        throw new Error("結果列は" + workerData.maxColumns + "個以内で指定してください。");
      }

      const rows = [];
      let byteLength = 0;
      let truncated = false;
      const iterator = await statement.iterate(
        /:groupId\b/.test(workerData.query) ? { groupId: workerData.groupId } : {},
      );

      for (const resultRow of iterator) {
        if (rows.length === workerData.maxRows) {
          truncated = true;
          break;
        }

        const row = Object.fromEntries(
          columns.map((column) => [column, serializeValue(resultRow[column])]),
        );
        const rowByteLength = Buffer.byteLength(JSON.stringify(row));
        if (byteLength + rowByteLength > workerData.maxBytes) {
          truncated = true;
          break;
        }

        rows.push(row);
        byteLength += rowByteLength;
      }

      parentPort.postMessage({
        result: { columns, rows, rowCount: rows.length, truncated },
      });
    } finally {
      database.close();
    }
  }

  run().catch((error) => {
    parentPort.postMessage({
      error: error instanceof Error ? error.message : "SQLの実行に失敗しました。",
    });
  });
`;

export function describeDatabaseSchema(): string {
  const tables = (Object.values(schema) as unknown[])
    .filter(isTable)
    .map((table) => {
      const columns = Object.values(getTableColumns(table))
        .map(
          (column) => `${column.name} ${column.getSQLType()}${column.notNull ? " NOT NULL" : ""}`,
        )
        .join(", ");
      return `- ${getTableName(table)}(${columns})`;
    })
    .sort()
    .join("\n");

  const transactions = getTableName(schema.transactions);
  const groupAccounts = getTableName(schema.groupAccounts);
  const holdings = getTableName(schema.holdings);
  const holdingValues = getTableName(schema.holdingValues);
  const dailySnapshots = getTableName(schema.dailySnapshots);
  const assetCategories = getTableName(schema.assetCategories);
  const assetHistory = getTableName(schema.assetHistory);
  const assetHistoryCategories = getTableName(schema.assetHistoryCategories);
  const directlyGroupedTables = [schema.spendingTargets, schema.analyticsReports]
    .map(getTableName)
    .join(", ");

  return `${tables}

リレーションと家計データの意味:
- 金額は円。${transactions}.${schema.transactions.amount.name}は収入・支出とも常に正の値であり、符号から種別を判定してはいけない
- 通常明細は${transactions}.${schema.transactions.type.name} = 'income'が収入・入金、'expense'が支出・出金、'transfer'が振替である。説明、カテゴリ、金額、口座残高の増減から種別を推測してはいけない
- 振替元の${transactions}.${schema.transactions.accountId.name}だけが現在グループ内なら収入、${schema.transactions.transferTargetAccountId.name}だけが現在グループ内なら支出として扱う。両口座が同じユーザー定義グループ（group_id = '0'を除く）に属する内部振替は集計から除外する
- 収支は上記で分類した収入合計から支出合計を引いた値であり、全取引の単純なSUMではない。同一の振替や対応する通常明細を重複集計しない
- 通常の収支集計では${schema.transactions.isTransfer.name} = 0かつ${schema.transactions.isExcludedFromCalculation.name} = 0を使用する
- chat query sandboxの${transactions}.is_internal_transfer = 1は、振替元・振替先が同じユーザー定義group（group_id = '0'を除く）に属する内部振替であり、収支集計から除外する
- 月はsubstr(${transactions}.${schema.transactions.date.name}, 1, 7)でYYYY-MMとして取得できる
- ${schema.transactions.category.name}が大カテゴリ、${schema.transactions.subCategory.name}が中カテゴリ、${schema.transactions.description.name}が個別明細の内容
- 現在グループの取引は${transactions}.${schema.transactions.accountId.name}を${groupAccounts}.${schema.groupAccounts.accountId.name}へJOINし、${groupAccounts}.${schema.groupAccounts.groupId.name} = :groupIdで絞る
- 現在グループの保有資産も${holdings}.${schema.holdings.accountId.name}を${groupAccounts}経由で絞る
- 現在グループの総資産は${assetHistory}.${schema.assetHistory.groupId.name} = :groupIdで絞り、${schema.assetHistory.date.name}が最新の行の${schema.assetHistory.totalAssets.name}を使用する。保有銘柄の件数や評価額から総資産を推測・再計算しない
- 総資産のカテゴリ内訳は最新の${assetHistory}を${assetHistoryCategories}.${schema.assetHistoryCategories.assetHistoryId.name} = ${assetHistory}.${schema.assetHistory.id.name}でJOINし、${schema.assetHistoryCategories.categoryName.name}と${schema.assetHistoryCategories.amount.name}を使用する
- 銘柄名や資産・負債の区分は${holdings}、評価額・数量・単価・前日比・含み損益は${holdingValues}にある。${holdingValues}.${schema.holdingValues.holdingId.name} = ${holdings}.${schema.holdings.id.name}でJOINする
- 資産・負債・投資の現在金額には${holdingValues}.${schema.holdingValues.amount.name}を使用する。件数を明示的に求められていない限りCOUNTではなく金額の合計と内訳を取得する
- 負債は${holdings}.${schema.holdings.type.name} = 'liability'で判定する。負債の総額は各負債の最新${holdingValues}.${schema.holdingValues.amount.name}のSUM、内訳は${holdings}.${schema.holdings.liabilityCategory.name}ごとのSUMとして取得し、件数や登録状況へ読み替えない
- 資産カテゴリは${holdings}.${schema.holdings.categoryId.name} = ${assetCategories}.${schema.assetCategories.id.name}でJOINする。投資情報には主に「株式(現物)」「投資信託」「債券」「FX」「先物」「暗号資産・FX・貴金属」のカテゴリを使用し、「預金・現金」「暗号資産」「電子マネー・プリペイド」は含めない
- 銘柄・負債・投資の現在値は、${holdingValues}.${schema.holdingValues.snapshotId.name} = ${dailySnapshots}.${schema.dailySnapshots.id.name}でJOINし、${schema.dailySnapshots.refreshCompleted.name} = 1の中から銘柄ごとに${schema.dailySnapshots.date.name} DESC, ${dailySnapshots}.${schema.dailySnapshots.id.name} DESCの先頭1件を使用する
- ${dailySnapshots}.${schema.dailySnapshots.groupId.name}は取得時のグループであり、選択中グループの口座と一致するとは限らない。銘柄・負債・投資を現在グループへ絞る目的で${dailySnapshots}.${schema.dailySnapshots.groupId.name} = :groupIdを使用してはいけない。必ず${holdings}から${groupAccounts}を経由して絞る
- ${directlyGroupedTables}は${schema.assetHistory.groupId.name} = :groupIdで直接絞る`;
}

function maskCommentsAndQuotedText(sql: string): string {
  let result = "";
  let index = 0;

  while (index < sql.length) {
    const character = sql[index];
    const next = sql[index + 1];

    if (character === "-" && next === "-") {
      const end = sql.indexOf("\n", index + 2);
      const length = (end === -1 ? sql.length : end) - index;
      result += " ".repeat(length);
      index += length;
      continue;
    }

    if (character === "/" && next === "*") {
      const closingIndex = sql.indexOf("*/", index + 2);
      const end = closingIndex === -1 ? sql.length : closingIndex + 2;
      result += " ".repeat(end - index);
      index = end;
      continue;
    }

    if (character === "'" || character === '"' || character === "`" || character === "[") {
      const closingCharacter = character === "[" ? "]" : character;
      const start = index;
      index += 1;

      while (index < sql.length) {
        if (sql[index] !== closingCharacter) {
          index += 1;
          continue;
        }
        if (closingCharacter !== "]" && sql[index + 1] === closingCharacter) {
          index += 2;
          continue;
        }
        index += 1;
        break;
      }

      result += " ".repeat(index - start);
      continue;
    }

    result += character;
    index += 1;
  }

  return result;
}

export function normalizeReadOnlySql(sql: string): string {
  const normalized = sql.trim().replace(/;\s*$/, "");
  const masked = maskCommentsAndQuotedText(normalized);

  if (normalized.length > READ_ONLY_QUERY_MAX_SQL_LENGTH) {
    throw new Error(`SQLは${READ_ONLY_QUERY_MAX_SQL_LENGTH}文字以内で指定してください。`);
  }
  if (!/^\s*(?:select|with)\b/i.test(masked)) {
    throw new Error("SELECTまたはWITHで始まるread-only SQLだけを実行できます。");
  }
  if (masked.includes(";")) {
    throw new Error("一度に実行できるSQLは1文だけです。");
  }
  if (WRITE_KEYWORDS.test(masked)) {
    throw new Error("データを変更するSQLは実行できません。");
  }
  if (SCHEMA_QUALIFIER.test(normalized)) {
    throw new Error("データベースschemaを直接指定するSQLは実行できません。");
  }
  if (EXPENSIVE_SQL.test(masked)) {
    throw new Error("実行量または返却サイズが大きくなるSQLは実行できません。");
  }
  if ((masked.match(/\bjoin\b/gi)?.length ?? 0) > MAX_JOIN_COUNT) {
    throw new Error(`JOINは${MAX_JOIN_COUNT}個以内で指定してください。`);
  }
  if ((masked.match(/\bunion\b/gi)?.length ?? 0) > MAX_UNION_COUNT) {
    throw new Error(`UNIONは${MAX_UNION_COUNT}個以内で指定してください。`);
  }

  return normalized;
}

function quoteSqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function createScopedDatabaseSql(databasePath: string, groupId: string): string {
  const sourceDatabase = quoteSqlText(databasePath);
  const selectedGroup = quoteSqlText(groupId);
  const accountIds = `SELECT account_id FROM source.group_accounts WHERE group_id = ${selectedGroup}`;
  const holdingIds = `SELECT id FROM source.holdings WHERE account_id IN (${accountIds})`;
  const assetHistoryIds = `SELECT id FROM source.asset_history WHERE group_id = ${selectedGroup}`;

  return `
    ATTACH DATABASE ${sourceDatabase} AS source;
    BEGIN;
    CREATE TABLE groups AS
      SELECT * FROM source.groups WHERE id = ${selectedGroup};
    CREATE TABLE group_accounts AS
      SELECT * FROM source.group_accounts WHERE group_id = ${selectedGroup};
    CREATE TABLE institution_categories AS
      SELECT * FROM source.institution_categories;
    CREATE TABLE accounts AS
      SELECT id, NULL AS mf_id, name, type, institution, category_id, created_at, updated_at, is_active
      FROM source.accounts
      WHERE id IN (${accountIds});
    CREATE TABLE asset_categories AS
      SELECT * FROM source.asset_categories;
    CREATE TABLE account_statuses AS
      SELECT * FROM source.account_statuses WHERE account_id IN (${accountIds});
    CREATE TABLE holdings AS
      SELECT
        id,
        NULL AS mf_id,
        account_id,
        category_id,
        name,
        code,
        type,
        liability_category,
        created_at,
        updated_at,
        is_active
      FROM source.holdings
      WHERE id IN (${holdingIds});
    CREATE TABLE daily_snapshots AS
      SELECT
        id,
        ${selectedGroup} AS group_id,
        date,
        refresh_completed,
        created_at,
        updated_at
      FROM source.daily_snapshots
      WHERE group_id = ${selectedGroup}
        OR id IN (
          SELECT snapshot_id FROM source.holding_values WHERE holding_id IN (${holdingIds})
        );
    CREATE TABLE holding_values AS
      SELECT * FROM source.holding_values WHERE holding_id IN (${holdingIds});
    CREATE TABLE transactions AS
      SELECT
        id,
        NULL AS mf_id,
        date,
        CASE WHEN account_id IN (${accountIds}) THEN account_id END AS account_id,
        category,
        sub_category,
        description,
        amount,
        type,
        is_transfer,
        is_excluded_from_calculation,
        CASE WHEN transfer_target_account_id IN (${accountIds}) THEN transfer_target END
          AS transfer_target,
        CASE WHEN transfer_target_account_id IN (${accountIds}) THEN transfer_target_account_id END
          AS transfer_target_account_id,
        CASE
          WHEN type = 'transfer' AND EXISTS (
            SELECT 1
            FROM source.group_accounts source_group
            JOIN source.group_accounts target_group
              ON target_group.group_id = source_group.group_id
            WHERE source_group.account_id = source.transactions.account_id
              AND target_group.account_id = source.transactions.transfer_target_account_id
              AND source_group.group_id <> '0'
          )
          THEN 1
          ELSE 0
        END AS is_internal_transfer,
        created_at,
        updated_at
      FROM source.transactions
      WHERE account_id IN (${accountIds}) OR transfer_target_account_id IN (${accountIds});
    CREATE TABLE asset_history AS
      SELECT * FROM source.asset_history WHERE id IN (${assetHistoryIds});
    CREATE TABLE asset_history_categories AS
      SELECT * FROM source.asset_history_categories WHERE asset_history_id IN (${assetHistoryIds});
    CREATE TABLE spending_targets AS
      SELECT * FROM source.spending_targets WHERE group_id = ${selectedGroup};
    CREATE TABLE analytics_reports AS
      SELECT * FROM source.analytics_reports WHERE group_id = ${selectedGroup};
    CREATE INDEX group_accounts_group_id_idx ON group_accounts(group_id);
    CREATE INDEX group_accounts_account_id_idx ON group_accounts(account_id);
    CREATE INDEX holdings_account_id_idx ON holdings(account_id);
    CREATE INDEX holding_values_holding_id_idx ON holding_values(holding_id);
    CREATE INDEX transactions_account_id_idx ON transactions(account_id);
    CREATE INDEX transactions_date_idx ON transactions(date);
    CREATE INDEX asset_history_group_id_idx ON asset_history(group_id);
    COMMIT;
    DETACH DATABASE source;
    PRAGMA query_only = ON;
  `;
}

function validateReferencedTables(sql: string): void {
  const masked = maskCommentsAndQuotedText(sql);
  const cteNames = new Set(
    [...masked.matchAll(/(?:\bwith\b|,)\s*([a-z_][\w$]*)\s+as\s*\(/gi)].map((match) =>
      match[1]!.toLowerCase(),
    ),
  );

  for (const match of masked.matchAll(/\b(?:from|join)\s+([a-z_][\w$]*)/gi)) {
    const tableName = match[1]!.toLowerCase();
    if (!TABLE_NAME_SET.has(tableName) && !cteNames.has(tableName)) {
      throw new Error(`許可されていないテーブル ${tableName} は参照できません。`);
    }
  }

  if (/\b(?:from|join)\s+["'`[]/i.test(sql)) {
    throw new Error("テーブル名はschemaに記載された形式で指定してください。");
  }
}

interface QueryWorkerMessage {
  error?: string;
  result?: {
    columns: string[];
    rows: Record<string, unknown>[];
    rowCount: number;
    truncated: boolean;
  };
}

function runSandboxedQuery(
  databasePath: string,
  query: string,
  groupId: string,
): Promise<NonNullable<QueryWorkerMessage["result"]>> {
  const worker = new Worker(QUERY_WORKER_SOURCE, {
    eval: true,
    workerData: {
      groupId,
      libsqlModulePath,
      maxBytes: READ_ONLY_QUERY_MAX_BYTES,
      maxColumns: MAX_RESULT_COLUMNS,
      maxRows: READ_ONLY_QUERY_MAX_ROWS,
      query,
      scopedDatabaseSql: createScopedDatabaseSql(databasePath, groupId),
    },
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      void worker
        .terminate()
        .then(() => reject(new Error("SQLの実行時間が上限を超えました。")))
        .catch(reject);
    }, READ_ONLY_QUERY_TIMEOUT_MS);

    function finish(callback: () => void): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    }

    worker.on("message", (message: QueryWorkerMessage) => {
      finish(() => {
        if (message.result) {
          resolve(message.result);
        } else {
          reject(new Error(message.error ?? "SQLの実行に失敗しました。"));
        }
      });
    });
    worker.once("error", (error) => finish(() => reject(error)));
    worker.once("exit", (code) => {
      finish(() => reject(new Error(`SQL workerが終了しました (code: ${code})。`)));
    });
  });
}

export async function executeReadOnlyQuery(
  _db: Db,
  sql: string,
  groupId: string,
  databasePath = getDbPath(),
) {
  const query = normalizeReadOnlySql(sql);
  validateReferencedTables(query);
  return runSandboxedQuery(databasePath, query, groupId);
}
