import {
  describeDatabaseSchema,
  executeReadOnlyQuery,
  READ_ONLY_QUERY_MAX_ROWS,
  type Db,
} from "@mf-dashboard/db";
import { tool } from "ai";
import { z } from "zod";

function getDatabaseDescription(): string {
  return `SQLiteデータベースへread-only SQLを実行する。
現在のグループIDは名前付きパラメータ :groupId としてサーバーがbindする。グループに属するデータは必ずこのパラメータで絞る。

利用可能なテーブルと物理カラム（Drizzle schemaから自動生成）:
${describeDatabaseSchema()}

- 具体的な明細、内訳、最大・最小、比較、推移など、質問に必要なSQLを自由に組み立ててよい

SELECTまたはWITHで始まる単一SQLだけを実行できる。結果は最大${READ_ONLY_QUERY_MAX_ROWS}行。`;
}

export function createDatabaseQueryTool(db: Db, groupId: string) {
  return tool({
    description: getDatabaseDescription(),
    inputSchema: z.object({
      sql: z
        .string()
        .trim()
        .min(1)
        .max(20_000)
        .describe("実行するSQLiteのSELECTまたはWITH文。現在グループには:groupIdを使用する"),
    }),
    execute: async ({ sql }) => await executeReadOnlyQuery(db, sql, groupId),
  });
}
