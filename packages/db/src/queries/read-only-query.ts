import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { getTableColumns, getTableName, isTable } from "drizzle-orm";
import { getDbPath } from "../db-path";
import type { Db } from "../index";
import * as schema from "../schema/schema";

export const READ_ONLY_QUERY_MAX_ROWS = 200;
export const READ_ONLY_QUERY_MAX_BYTES = 64 * 1024;
export const READ_ONLY_QUERY_TIMEOUT_MS = 1_000;
export const READ_ONLY_QUERY_MAX_SQL_LENGTH = 5_000;
export const READ_ONLY_QUERY_MAX_SQLITE_HEAP_BYTES = 64 * 1024 * 1024;

const MAX_RESULT_COLUMNS = 32;
const MAX_JOIN_COUNT = 8;
const MAX_UNION_COUNT = 8;

const WRITE_KEYWORDS =
  /\b(?:alter|analyze|attach|create|delete|detach|drop|insert|pragma|reindex|release|replace|rollback|savepoint|update|vacuum)\b/i;
const EXPENSIVE_SQL =
  /\b(?:cross\s+join|group_concat|hex|json_group_array|json_group_object|printf|randomblob|zeroblob|with\s+recursive)\b/i;

const TABLE_NAMES = (Object.values(schema) as unknown[]).filter(isTable).map(getTableName);

const TABLE_NAME_SET = new Set(TABLE_NAMES);
const SCHEMA_QUALIFIER = new RegExp(
  String.raw`\b(?:main|source|temp)\s*\.\s*(?:${TABLE_NAMES.join("|")})\b`,
  "i",
);
const libsqlModulePath = createRequire(import.meta.url).resolve("libsql/promise");

const QUERY_PROCESS_SOURCE = String.raw`
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    input += chunk;
  });
  process.stdin.on("end", () => {
    run(JSON.parse(input)).catch((error) => {
      send({
        error: error instanceof Error ? error.message : "SQLの実行に失敗しました。",
      });
    });
  });

  function send(message) {
    process.stdout.write(JSON.stringify(message));
  }

  function serializeValue(value) {
    return value instanceof Uint8Array ? Array.from(value) : value;
  }

  async function run(processData) {
    const Database = require(processData.libsqlModulePath);
    const database = await new Database(":memory:", {});

    try {
      await database.pragma("hard_heap_limit = " + processData.maxSqliteHeapBytes);
      await database.exec(processData.scopedDatabaseSql);
      const statement = await database.prepare(
        "SELECT * FROM (\n" + processData.query + "\n) AS query_result LIMIT " +
          (processData.maxRows + 1),
      );
      const columns = statement.columns().map((column) => column.name);
      if (columns.length > processData.maxColumns) {
        throw new Error("結果列は" + processData.maxColumns + "個以内で指定してください。");
      }

      const rows = [];
      let byteLength = 0;
      let truncated = false;
      const iterator = await statement.iterate(
        /:groupId\b/.test(processData.query) ? { groupId: processData.groupId } : {},
      );

      for (const resultRow of iterator) {
        if (rows.length === processData.maxRows) {
          truncated = true;
          break;
        }

        const row = Object.fromEntries(
          columns.map((column) => [column, serializeValue(resultRow[column])]),
        );
        const rowByteLength = Buffer.byteLength(JSON.stringify(row));
        if (byteLength + rowByteLength > processData.maxBytes) {
          truncated = true;
          break;
        }

        rows.push(row);
        byteLength += rowByteLength;
      }

      send({
        result: { columns, rows, rowCount: rows.length, truncated },
      });
    } finally {
      database.close();
    }
  }
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
- chat query sandboxの${transactions}.transfer_counterparty_keyは振替相手口座の匿名stable keyであり、振替の重複排除にはraw IDではなくこの値を使用する
- 振替元または振替先の口座IDが未解決の振替はchat query sandboxから除外済みであり、収入・支出へ集計しない
- 月はsubstr(${transactions}.${schema.transactions.date.name}, 1, 7)でYYYY-MMとして取得できる
- ${schema.transactions.category.name}が大カテゴリ、${schema.transactions.subCategory.name}が中カテゴリ、${schema.transactions.description.name}が個別明細の内容
- chat query sandboxの${transactions}は現在グループの振替元または振替先口座に関係する行へ限定済み。明示的に絞る場合は${schema.transactions.accountId.name}または${schema.transactions.transferTargetAccountId.name}のいずれかを${groupAccounts}.${schema.groupAccounts.accountId.name}と照合し、${groupAccounts}.${schema.groupAccounts.groupId.name} = :groupIdを使用する
- 現在グループの保有資産も${holdings}.${schema.holdings.accountId.name}を${groupAccounts}経由で絞る
- 現在グループの総資産は${assetHistory}.${schema.assetHistory.groupId.name} = :groupIdで絞り、${schema.assetHistory.date.name}が最新の行の${schema.assetHistory.totalAssets.name}を使用する。保有銘柄の件数や評価額から総資産を推測・再計算しない
- 総資産のカテゴリ内訳は最新の${assetHistory}を${assetHistoryCategories}.${schema.assetHistoryCategories.assetHistoryId.name} = ${assetHistory}.${schema.assetHistory.id.name}でJOINし、${schema.assetHistoryCategories.categoryName.name}と${schema.assetHistoryCategories.amount.name}を使用する
- 銘柄名や資産・負債の区分は${holdings}、評価額・数量・単価・前日比・含み損益は${holdingValues}にある。${holdingValues}.${schema.holdingValues.holdingId.name} = ${holdings}.${schema.holdings.id.name}でJOINする
- 資産・負債・投資の現在金額には${holdingValues}.${schema.holdingValues.amount.name}を使用する。件数を明示的に求められていない限りCOUNTではなく金額の合計と内訳を取得する
- 負債は${holdings}.${schema.holdings.type.name} = 'liability'で判定する。負債の総額は${holdingValues}.${schema.holdingValues.amount.name}のSUM、内訳は${holdings}.${schema.holdings.liabilityCategory.name}ごとのSUMとして取得し、件数や登録状況へ読み替えない
- 資産カテゴリは${holdings}.${schema.holdings.categoryId.name} = ${assetCategories}.${schema.assetCategories.id.name}でJOINする。投資情報には主に「株式(現物)」「投資信託」「債券」「FX」「先物」「暗号資産・FX・貴金属」のカテゴリを使用し、「預金・現金」「暗号資産」「電子マネー・プリペイド」は含めない
- chat query sandboxの${holdings}・${holdingValues}・${dailySnapshots}は、選択中グループの口座に紐づく保有情報を含む最新の完了snapshot 1件だけへ限定済み。銘柄・負債・投資の現在値は${holdingValues}.${schema.holdingValues.snapshotId.name} = ${dailySnapshots}.${schema.dailySnapshots.id.name}でJOINして使用する
- chat query sandboxの${dailySnapshots}.${schema.dailySnapshots.groupId.name}は選択中グループへ匿名化投影済み。保有情報のgroup scopeは${holdings}から${groupAccounts}を経由して確認する
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
  if (SCHEMA_QUALIFIER.test(masked)) {
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
  const groupHoldingIds = `SELECT id FROM source.holdings WHERE account_id IN (${accountIds})`;
  const latestHoldingSnapshotId = `
    SELECT holding_values.snapshot_id
    FROM source.holding_values
    JOIN source.daily_snapshots
      ON source.daily_snapshots.id = source.holding_values.snapshot_id
    WHERE source.holding_values.holding_id IN (${groupHoldingIds})
      AND source.daily_snapshots.refresh_completed = 1
    ORDER BY source.daily_snapshots.date DESC, source.daily_snapshots.id DESC
    LIMIT 1
  `;
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
    CREATE TABLE daily_snapshots AS
      SELECT
        id,
        ${selectedGroup} AS group_id,
        date,
        refresh_completed,
        created_at,
        updated_at
      FROM source.daily_snapshots
      WHERE id IN (${latestHoldingSnapshotId});
    CREATE TABLE holding_values AS
      SELECT *
      FROM source.holding_values
      WHERE snapshot_id IN (${latestHoldingSnapshotId})
        AND holding_id IN (${groupHoldingIds});
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
      WHERE id IN (SELECT holding_id FROM holding_values);
    CREATE TABLE transactions AS
      WITH external_transfer_candidates AS (
        SELECT
          transfer_target_account_id AS external_account_id
        FROM source.transactions
        WHERE type = 'transfer'
          AND account_id IN (${accountIds})
          AND transfer_target_account_id IS NOT NULL
          AND transfer_target_account_id NOT IN (${accountIds})
        UNION
        SELECT
          account_id AS external_account_id
        FROM source.transactions
        WHERE type = 'transfer'
          AND account_id NOT IN (${accountIds})
          AND transfer_target_account_id IN (${accountIds})
      ),
      external_transfer_accounts AS (
        SELECT
          external_account_id,
          ROW_NUMBER() OVER (ORDER BY external_account_id) AS anonymized_id
        FROM external_transfer_candidates
      )
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
          WHEN type <> 'transfer' THEN NULL
          WHEN account_id IN (${accountIds}) AND transfer_target_account_id IN (${accountIds})
            THEN 'account:' || transfer_target_account_id
          WHEN external_transfer_accounts.anonymized_id IS NOT NULL
            THEN 'external:' || external_transfer_accounts.anonymized_id
          ELSE 'external:unknown'
        END AS transfer_counterparty_key,
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
      LEFT JOIN external_transfer_accounts
        ON external_transfer_accounts.external_account_id =
          CASE
            WHEN source.transactions.account_id IN (${accountIds})
              THEN source.transactions.transfer_target_account_id
            ELSE source.transactions.account_id
          END
      WHERE (account_id IN (${accountIds}) OR transfer_target_account_id IN (${accountIds}))
        AND (
          type <> 'transfer'
          OR (account_id IS NOT NULL AND transfer_target_account_id IS NOT NULL)
        );
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
    [...masked.matchAll(/(?:\bwith\b|,)\s*([a-z_][\w$]*)\s*(?:\([^)]*\)\s*)?as\s*\(/gi)].map(
      (match) => match[1]!.toLowerCase(),
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

interface QueryProcessMessage {
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
): Promise<NonNullable<QueryProcessMessage["result"]>> {
  const child = spawn(process.execPath, ["--eval", QUERY_PROCESS_SOURCE], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const processData = JSON.stringify({
    groupId,
    libsqlModulePath,
    maxBytes: READ_ONLY_QUERY_MAX_BYTES,
    maxColumns: MAX_RESULT_COLUMNS,
    maxRows: READ_ONLY_QUERY_MAX_ROWS,
    maxSqliteHeapBytes: READ_ONLY_QUERY_MAX_SQLITE_HEAP_BYTES,
    query,
    scopedDatabaseSql: createScopedDatabaseSql(databasePath, groupId),
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let output = "";
    let errorOutput = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new Error("SQLの実行時間が上限を超えました。")));
    }, READ_ONLY_QUERY_TIMEOUT_MS);

    function finish(callback: () => void): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    }

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      errorOutput += chunk;
    });
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (code) => {
      finish(() => {
        if (code !== 0) {
          reject(new Error(errorOutput.trim() || `SQL processが終了しました (code: ${code})。`));
          return;
        }

        let message: QueryProcessMessage;
        try {
          message = JSON.parse(output) as QueryProcessMessage;
        } catch {
          reject(new Error("SQL processから無効な応答を受信しました。"));
          return;
        }

        if (message.result) {
          resolve(message.result);
        } else {
          reject(new Error(message.error ?? "SQLの実行に失敗しました。"));
        }
      });
    });
    child.stdin.end(processData);
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
