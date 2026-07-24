import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { getTableColumns, getTableName, isTable } from "drizzle-orm";
import { getDbPath } from "../db-path";
import type { Db } from "../index";
import * as schema from "../schema/schema";

export const READ_ONLY_QUERY_MAX_ROWS = 200;
export const READ_ONLY_QUERY_MAX_BYTES = 64 * 1024;
export const READ_ONLY_QUERY_TIMEOUT_MS = 1_000;
export const READ_ONLY_QUERY_SETUP_TIMEOUT_MS = 5_000;
export const READ_ONLY_QUERY_MAX_SQL_LENGTH = 5_000;
export const READ_ONLY_QUERY_MAX_SQLITE_HEAP_BYTES = 64 * 1024 * 1024;

const MAX_RESULT_COLUMNS = 32;
const MAX_JOIN_COUNT = 8;
const MAX_UNION_COUNT = 8;
const GLOBAL_SNAPSHOT_GROUP_ID = "0";

const WRITE_KEYWORDS =
  /\b(?:alter|analyze|attach|create|delete|detach|drop|insert|pragma|reindex|release|rollback|savepoint|update|vacuum)\b/i;
const WRITE_REPLACE_STATEMENT = /\breplace\b(?!\s*\()/i;
const EXPENSIVE_SQL =
  /\b(?:cross\s+join|group_concat|hex|json_group_array|json_group_object|printf|randomblob|zeroblob|with\s+recursive)\b/i;
const FILESYSTEM_SQL_FUNCTIONS = /\b(?:load_extension|readfile|writefile)\s*\(/i;
const QUOTED_EXPENSIVE_SQL_FUNCTIONS =
  /(?:["'`](?:group_concat|hex|json_group_array|json_group_object|printf|randomblob|zeroblob)["'`]|\[(?:group_concat|hex|json_group_array|json_group_object|printf|randomblob|zeroblob)\])\s*\(/i;
const QUOTED_FILESYSTEM_SQL_FUNCTIONS =
  /(?:["'`](?:load_extension|readfile|writefile)["'`]|\[(?:load_extension|readfile|writefile)\])\s*\(/i;

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
    process.stdout.write(JSON.stringify(message) + "\n");
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
      send({ ready: true });
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
- chat query sandboxのaccounts・holdings・transactionsにあるmf_idは匿名化のため常にNULL。件数にはid、振替の重複排除にはtransfer_counterparty_keyを使用する
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
- chat query sandboxの${dailySnapshots}は全口座を取得するno-group（group_id = '0'）の最新完了snapshot 1件、${holdings}・${holdingValues}はそのsnapshot内かつ現在グループ口座の行だけへ限定済み。最新snapshotが空なら過去の保有情報は含まれない。銘柄・負債・投資の現在値は${holdingValues}.${schema.holdingValues.snapshotId.name} = ${dailySnapshots}.${schema.dailySnapshots.id.name}でJOINして使用する
- chat query sandboxの${dailySnapshots}.${schema.dailySnapshots.groupId.name}は選択中グループへ匿名化投影済み。保有情報のgroup scopeは${holdings}から${groupAccounts}を経由して確認する
- ${directlyGroupedTables}は${schema.assetHistory.groupId.name} = :groupIdで直接絞る`;
}

function getQuotedTextEnd(sql: string, start: number): number {
  const closingCharacter = sql[start] === "[" ? "]" : sql[start]!;
  let index = start + 1;

  while (index < sql.length) {
    if (sql[index] !== closingCharacter) {
      index += 1;
      continue;
    }
    if (sql[index + 1] === closingCharacter) {
      index += 2;
      continue;
    }
    return index + 1;
  }

  return sql.length;
}

function maskComments(sql: string): string {
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
      const end = getQuotedTextEnd(sql, index);
      result += sql.slice(index, end);
      index = end;
      continue;
    }

    result += character;
    index += 1;
  }

  return result;
}

function maskCommentsAndQuotedText(sql: string): string {
  const commentMaskedSql = maskComments(sql);
  let result = "";
  let index = 0;

  while (index < commentMaskedSql.length) {
    const character = commentMaskedSql[index];

    if (character === "'" || character === '"' || character === "`" || character === "[") {
      const start = index;
      index = getQuotedTextEnd(commentMaskedSql, start);
      result += " ".repeat(index - start);
      continue;
    }

    result += character;
    index += 1;
  }

  return result;
}

export function normalizeReadOnlySql(sql: string): string {
  let normalized = sql.trim();
  let masked = maskCommentsAndQuotedText(normalized);
  let commentMasked = maskComments(normalized);
  const trailingSqlIndex = masked.trimEnd().length - 1;

  if (normalized[trailingSqlIndex] === ";") {
    normalized = normalized.slice(0, trailingSqlIndex) + normalized.slice(trailingSqlIndex + 1);
    masked = maskCommentsAndQuotedText(normalized);
    commentMasked = maskComments(normalized);
  }

  if (normalized.length > READ_ONLY_QUERY_MAX_SQL_LENGTH) {
    throw new Error(`SQLは${READ_ONLY_QUERY_MAX_SQL_LENGTH}文字以内で指定してください。`);
  }
  if (!/^\s*(?:select|with)\b/i.test(masked)) {
    throw new Error("SELECTまたはWITHで始まるread-only SQLだけを実行できます。");
  }
  if (masked.includes(";")) {
    throw new Error("一度に実行できるSQLは1文だけです。");
  }
  if (WRITE_KEYWORDS.test(masked) || WRITE_REPLACE_STATEMENT.test(masked)) {
    throw new Error("データを変更するSQLは実行できません。");
  }
  if (SCHEMA_QUALIFIER.test(masked)) {
    throw new Error("データベースschemaを直接指定するSQLは実行できません。");
  }
  if (EXPENSIVE_SQL.test(masked) || QUOTED_EXPENSIVE_SQL_FUNCTIONS.test(commentMasked)) {
    throw new Error("実行量または返却サイズが大きくなるSQLは実行できません。");
  }
  if (
    FILESYSTEM_SQL_FUNCTIONS.test(masked) ||
    QUOTED_FILESYSTEM_SQL_FUNCTIONS.test(commentMasked)
  ) {
    throw new Error("filesystemへアクセスするSQL関数は使用できません。");
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
  const globalSnapshotGroup = quoteSqlText(GLOBAL_SNAPSHOT_GROUP_ID);
  const accountIds = `
    SELECT account_id FROM source.group_accounts WHERE group_id = ${selectedGroup}
    UNION
    SELECT id FROM source.accounts
    WHERE mf_id = 'unknown' AND ${selectedGroup} = ${globalSnapshotGroup}
  `;
  const groupHoldingIds = `SELECT id FROM source.holdings WHERE account_id IN (${accountIds})`;
  const latestHoldingSnapshotId = `
    SELECT id
    FROM source.daily_snapshots
    WHERE group_id = ${globalSnapshotGroup}
      AND refresh_completed = 1
    ORDER BY date DESC, id DESC
    LIMIT 1
  `;
  const assetHistoryIds = `SELECT id FROM source.asset_history WHERE group_id = ${selectedGroup}`;

  return `
    ATTACH DATABASE ${sourceDatabase} AS source;
    BEGIN;
    CREATE TABLE groups AS
      SELECT * FROM source.groups WHERE id = ${selectedGroup};
    CREATE TABLE group_accounts AS
      SELECT * FROM source.group_accounts WHERE group_id = ${selectedGroup}
      UNION ALL
      SELECT
        -1 AS id,
        ${globalSnapshotGroup} AS group_id,
        id AS account_id,
        created_at,
        updated_at
      FROM source.accounts
      WHERE mf_id = 'unknown'
        AND ${selectedGroup} = ${globalSnapshotGroup}
        AND id NOT IN (
          SELECT account_id FROM source.group_accounts WHERE group_id = ${globalSnapshotGroup}
        );
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
      WHERE (
        (type = 'transfer' AND (
          account_id IN (${accountIds}) OR transfer_target_account_id IN (${accountIds})
        ))
        OR (type <> 'transfer' AND account_id IN (${accountIds}))
      )
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
      SELECT * FROM source.analytics_reports WHERE 0;
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

interface CommonTableExpression {
  bodyEnd: number;
  bodyStart: number;
  name: string;
  scopeEnd: number;
  scopeStart: number;
}

interface QuotedIdentifier {
  end: number;
  name: string;
}

function readQuotedIdentifier(sql: string, start: number): QuotedIdentifier | undefined {
  const openingCharacter = sql[start];
  if (!openingCharacter || !['"', "'", "`", "["].includes(openingCharacter)) return undefined;

  const closingCharacter = openingCharacter === "[" ? "]" : openingCharacter;
  const end = getQuotedTextEnd(sql, start);
  if (end === sql.length && sql[end - 1] !== closingCharacter) return undefined;

  return {
    end,
    name: sql
      .slice(start + 1, end - 1)
      .replaceAll(closingCharacter + closingCharacter, closingCharacter)
      .toLowerCase(),
  };
}

function findClosingParenthesis(sql: string, openingIndex: number): number {
  let depth = 0;

  for (let index = openingIndex; index < sql.length; index += 1) {
    if (sql[index] === "(") depth += 1;
    if (sql[index] !== ")") continue;

    depth -= 1;
    if (depth === 0) return index;
  }

  return -1;
}

function findCommonTableExpressions(
  maskedSql: string,
  commentMaskedSql: string,
): CommonTableExpression[] {
  const definitions: CommonTableExpression[] = [];
  for (const withMatch of commentMaskedSql.matchAll(/\bwith\b\s*/gi)) {
    const withIndex = withMatch.index!;
    const precedingIndex = commentMaskedSql.slice(0, withIndex).search(/\S\s*$/);
    if (precedingIndex >= 0 && maskedSql[precedingIndex] !== "(") continue;

    const scopeEnd =
      precedingIndex >= 0 ? findClosingParenthesis(maskedSql, precedingIndex) : maskedSql.length;
    if (scopeEnd === -1) continue;

    let index = withIndex + withMatch[0].length;
    while (index < scopeEnd) {
      const quotedName = readQuotedIdentifier(commentMaskedSql, index);
      const nameMatch = quotedName ? undefined : /^[a-z_][\w$]*/i.exec(maskedSql.slice(index));
      if (!quotedName && !nameMatch) break;

      const name = quotedName?.name ?? nameMatch![0].toLowerCase();
      index = quotedName?.end ?? index + nameMatch![0].length;
      index += /^\s*/.exec(maskedSql.slice(index))![0].length;

      if (maskedSql[index] === "(") {
        const columnListEnd = findClosingParenthesis(maskedSql, index);
        if (columnListEnd === -1) break;
        index = columnListEnd + 1;
      }

      const asMatch = /^\s*as\s*(?:(?:not\s+)?materialized\s*)?\(/i.exec(maskedSql.slice(index));
      if (!asMatch) break;

      const openingIndex = index + asMatch[0].lastIndexOf("(");
      const closingIndex = findClosingParenthesis(maskedSql, openingIndex);
      if (closingIndex === -1) break;

      definitions.push({
        bodyEnd: closingIndex,
        bodyStart: openingIndex + 1,
        name,
        scopeEnd,
        scopeStart: withIndex,
      });

      index = closingIndex + 1;
      index += /^\s*/.exec(commentMaskedSql.slice(index))![0].length;
      if (maskedSql[index] !== ",") break;
      index += 1;
      index += /^\s*/.exec(commentMaskedSql.slice(index))![0].length;
    }
  }

  return definitions;
}

function validateReferencedTables(sql: string): void {
  const masked = maskCommentsAndQuotedText(sql);
  const commentMasked = maskComments(sql);
  const commonTableExpressions = findCommonTableExpressions(masked, commentMasked);
  const isCteInScope = (name: string, index: number) =>
    commonTableExpressions.some(
      (definition) =>
        definition.name === name && index >= definition.scopeStart && index < definition.scopeEnd,
    );
  const sourceClauseDepths = new Set<number>();
  let depth = 0;
  let expectsSource = false;

  for (const match of masked.matchAll(/[a-z_][\w$]*|[(),]/gi)) {
    const token = match[0]!.toLowerCase();
    const followingSql = commentMasked.slice(match.index! + match[0]!.length);
    const startsSource =
      token === "from" || token === "join" || (token === "," && sourceClauseDepths.has(depth));
    let hasQuotedSource = false;

    if (startsSource) {
      const prefix = /^\s*\(*\s*/.exec(followingSql)![0];
      const quotedSourceIndex = match.index! + match[0]!.length + prefix.length;
      const quotedSource = readQuotedIdentifier(commentMasked, quotedSourceIndex);

      if (quotedSource) {
        if (
          /^\s*\./.test(commentMasked.slice(quotedSource.end)) ||
          (!TABLE_NAME_SET.has(quotedSource.name) &&
            !isCteInScope(quotedSource.name, quotedSourceIndex))
        ) {
          throw new Error("テーブル名はschemaに記載された形式で指定してください。");
        }
        if (
          commonTableExpressions.some(
            ({ bodyEnd, bodyStart, name }) =>
              quotedSource.name === name &&
              quotedSourceIndex >= bodyStart &&
              quotedSourceIndex < bodyEnd,
          )
        ) {
          throw new Error("再帰CTEは使用できません。");
        }
        hasQuotedSource = true;
      }
    }

    if (token === "(") {
      depth += 1;
      continue;
    }
    if (token === ")") {
      sourceClauseDepths.delete(depth);
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (token === "from") {
      sourceClauseDepths.add(depth);
      expectsSource = !hasQuotedSource;
      continue;
    }
    if (token === "join") {
      expectsSource = !hasQuotedSource;
      continue;
    }
    if (
      sourceClauseDepths.has(depth) &&
      /^(?:where|group|having|order|limit|union|except|intersect|window)$/.test(token)
    ) {
      sourceClauseDepths.delete(depth);
      expectsSource = false;
      continue;
    }
    if (token === "," && sourceClauseDepths.has(depth)) {
      expectsSource = !hasQuotedSource;
      continue;
    }
    if (!expectsSource || token === ",") {
      continue;
    }

    expectsSource = false;
    if (token === "select" || token === "with") {
      continue;
    }
    if (
      commonTableExpressions.some(
        ({ bodyEnd, bodyStart, name }) =>
          token === name && match.index! >= bodyStart && match.index! < bodyEnd,
      )
    ) {
      throw new Error("再帰CTEは使用できません。");
    }
    if (!TABLE_NAME_SET.has(token) && !isCteInScope(token, match.index!)) {
      throw new Error(`許可されていないテーブル ${token} は参照できません。`);
    }
  }
}

interface QueryProcessMessage {
  error?: string;
  ready?: boolean;
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
  abortSignal?: AbortSignal,
): Promise<NonNullable<QueryProcessMessage["result"]>> {
  const child = spawn(process.execPath, ["--eval", QUERY_PROCESS_SOURCE], {
    env: {
      NODE_ENV: process.env.NODE_ENV ?? "production",
      TZ: process.env.TZ ?? "Asia/Tokyo",
    },
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
    let message: QueryProcessMessage | undefined;
    let timeout: ReturnType<typeof setTimeout>;

    function finish(callback: () => void): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      abortSignal?.removeEventListener("abort", abortSandbox);
      callback();
    }

    function abortSandbox(): void {
      child.kill("SIGKILL");
      finish(() => reject(abortSignal?.reason ?? new Error("SQLの実行を中断しました。")));
    }

    function armTimeout(duration: number, errorMessage: string): void {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        child.kill("SIGKILL");
        finish(() => reject(new Error(errorMessage)));
      }, duration);
    }

    armTimeout(READ_ONLY_QUERY_SETUP_TIMEOUT_MS, "SQL sandboxの準備時間が上限を超えました。");
    if (abortSignal?.aborted) {
      abortSandbox();
      return;
    }
    abortSignal?.addEventListener("abort", abortSandbox, { once: true });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
      let lineEnd = output.indexOf("\n");

      while (lineEnd !== -1) {
        const line = output.slice(0, lineEnd);
        output = output.slice(lineEnd + 1);
        const nextMessage = JSON.parse(line) as QueryProcessMessage;

        if (nextMessage.ready) {
          armTimeout(READ_ONLY_QUERY_TIMEOUT_MS, "SQLの実行時間が上限を超えました。");
        } else {
          message = nextMessage;
        }
        lineEnd = output.indexOf("\n");
      }
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

        if (message?.result) {
          resolve(message.result);
        } else {
          reject(new Error(message?.error ?? "SQL processから無効な応答を受信しました。"));
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
  abortSignal?: AbortSignal,
) {
  abortSignal?.throwIfAborted();
  const query = normalizeReadOnlySql(sql);
  validateReferencedTables(query);
  return runSandboxedQuery(databasePath, query, groupId, abortSignal);
}
