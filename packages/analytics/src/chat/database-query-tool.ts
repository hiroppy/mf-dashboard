import type { Db } from "@mf-dashboard/db";
import {
  describeDatabaseSchema,
  executeReadOnlyQuery,
  READ_ONLY_QUERY_MAX_BYTES,
  READ_ONLY_QUERY_MAX_ROWS,
  READ_ONLY_QUERY_MAX_SQL_LENGTH,
  READ_ONLY_QUERY_TIMEOUT_MS,
} from "@mf-dashboard/db/queries/read-only-query";
import { tool } from "ai";
import { z } from "zod";

function getDatabaseDescription(): string {
  return `SQLiteデータベースへread-only SQLを実行する。
現在のグループIDは名前付きパラメータ :groupId としてサーバーがbindする。グループに属するデータは必ずこのパラメータで絞る。

利用可能なテーブルと物理カラム（Drizzle schemaから自動生成）:
${describeDatabaseSchema()}

- 具体的な明細、内訳、最大・最小、比較、推移など、質問に必要なSQLを自由に組み立ててよい

SELECTまたはWITHで始まる単一SQLだけを実行できる。SQLは最大${READ_ONLY_QUERY_MAX_SQL_LENGTH}文字、結果は最大${READ_ONLY_QUERY_MAX_ROWS}行・${READ_ONLY_QUERY_MAX_BYTES / 1024} KiB、実行時間は最大${READ_ONLY_QUERY_TIMEOUT_MS / 1_000}秒。`;
}

export function createDatabaseQueryTool(
  db: Db,
  groupId: string,
  beforeExecute: () => void = () => undefined,
) {
  return tool({
    description: getDatabaseDescription(),
    inputSchema: z.object({
      sql: z
        .string()
        .trim()
        .min(1)
        .max(READ_ONLY_QUERY_MAX_SQL_LENGTH)
        .describe("実行するSQLiteのSELECTまたはWITH文。現在グループには:groupIdを使用する"),
    }),
    execute: async ({ sql }) => {
      beforeExecute();
      return await executeReadOnlyQuery(db, sql, groupId);
    },
  });
}
