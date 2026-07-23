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
    sql: `SELECT * FROM (\n${query}\n) AS query_result LIMIT ${READ_ONLY_QUERY_MAX_ROWS + 1}`,
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
