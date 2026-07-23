import type { Client, InValue } from "@libsql/client";
import { getTableColumns, getTableName, isTable } from "drizzle-orm";
import type { Db } from "../index";
import * as schema from "../schema/schema";

export const READ_ONLY_QUERY_MAX_ROWS = 200;

const WRITE_KEYWORDS =
  /\b(?:alter|analyze|attach|create|delete|detach|drop|insert|pragma|reindex|release|replace|rollback|savepoint|update|vacuum)\b/i;

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
  const directlyGroupedTables = [
    schema.assetHistory,
    schema.dailySnapshots,
    schema.spendingTargets,
    schema.analyticsReports,
  ]
    .map(getTableName)
    .join(", ");

  return `${tables}

リレーションと家計データの意味:
- 金額は円。${transactions}.${schema.transactions.amount.name}は収入・支出とも常に正の値であり、符号から種別を判定してはいけない
- ${transactions}.${schema.transactions.type.name} = 'income'だけが収入・入金、'expense'だけが支出・出金、'transfer'は振替である。説明、カテゴリ、金額、口座残高の増減から種別を推測してはいけない
- 支出を問われたSQLには${transactions}.${schema.transactions.type.name} = 'expense'、収入・入金を問われたSQLには${transactions}.${schema.transactions.type.name} = 'income'を必ず条件として含める
- 収支は収入合計から支出合計を引いた値（income - expense）であり、全取引の単純なSUMではない
- 通常の収支集計では${schema.transactions.isTransfer.name} = 0かつ${schema.transactions.isExcludedFromCalculation.name} = 0を使用する
- 月はsubstr(${transactions}.${schema.transactions.date.name}, 1, 7)でYYYY-MMとして取得できる
- ${schema.transactions.category.name}が大カテゴリ、${schema.transactions.subCategory.name}が中カテゴリ、${schema.transactions.description.name}が個別明細の内容
- 現在グループの取引は${transactions}.${schema.transactions.accountId.name}を${groupAccounts}.${schema.groupAccounts.accountId.name}へJOINし、${groupAccounts}.${schema.groupAccounts.groupId.name} = :groupIdで絞る
- 現在グループの保有資産も${holdings}.${schema.holdings.accountId.name}を${groupAccounts}経由で絞る
- 銘柄名や資産・負債の区分は${holdings}、評価額・数量・単価・前日比・含み損益は${holdingValues}にある。${holdingValues}.${schema.holdingValues.holdingId.name} = ${holdings}.${schema.holdings.id.name}でJOINする
- 資産・負債・投資の現在金額には${holdingValues}.${schema.holdingValues.amount.name}を使用する。件数を明示的に求められていない限りCOUNTではなく金額の合計と内訳を取得する
- 負債は${holdings}.${schema.holdings.type.name} = 'liability'で判定する。負債の総額は最新スナップショットの${holdingValues}.${schema.holdingValues.amount.name}のSUM、内訳は${holdings}.${schema.holdings.liabilityCategory.name}ごとのSUMとして取得し、件数や登録状況へ読み替えない
- 資産カテゴリは${holdings}.${schema.holdings.categoryId.name} = ${assetCategories}.${schema.assetCategories.id.name}でJOINする。投資情報には主に「株式(現物)」「投資信託」「債券」「FX」「先物」「暗号資産・FX・貴金属」のカテゴリを使用し、「預金・現金」「暗号資産」「電子マネー・プリペイド」は含めない
- ${holdingValues}.${schema.holdingValues.snapshotId.name} = ${dailySnapshots}.${schema.dailySnapshots.id.name}でJOINし、${dailySnapshots}.${schema.dailySnapshots.groupId.name} = :groupIdで絞る。現在値は${schema.dailySnapshots.refreshCompleted.name} = 1のうち${schema.dailySnapshots.date.name}が最新のスナップショットを使用する
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

  if (!/^\s*(?:select|with)\b/i.test(masked)) {
    throw new Error("SELECTまたはWITHで始まるread-only SQLだけを実行できます。");
  }
  if (masked.includes(";")) {
    throw new Error("一度に実行できるSQLは1文だけです。");
  }
  if (WRITE_KEYWORDS.test(masked)) {
    throw new Error("データを変更するSQLは実行できません。");
  }

  return normalized;
}

function serializeValue(value: InValue | undefined) {
  return value instanceof Uint8Array ? Array.from(value) : value;
}

export async function executeReadOnlyQuery(db: Db, sql: string, groupId: string) {
  const query = normalizeReadOnlySql(sql);
  const client = (db as Db & { $client: Client }).$client;
  const result = await client.execute({
    sql: `SELECT * FROM (${query}) AS query_result LIMIT ${READ_ONLY_QUERY_MAX_ROWS + 1}`,
    args: /:groupId\b/.test(query) ? { groupId } : {},
  });
  const truncated = result.rows.length > READ_ONLY_QUERY_MAX_ROWS;

  return {
    columns: result.columns,
    rows: result.rows
      .slice(0, READ_ONLY_QUERY_MAX_ROWS)
      .map((row) =>
        Object.fromEntries(result.columns.map((column) => [column, serializeValue(row[column])])),
      ),
    rowCount: Math.min(result.rows.length, READ_ONLY_QUERY_MAX_ROWS),
    truncated,
  };
}
