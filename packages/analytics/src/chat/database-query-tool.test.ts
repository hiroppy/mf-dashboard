import type { Db } from "@mf-dashboard/db";
import {
  describeDatabaseSchema,
  executeReadOnlyQuery,
  READ_ONLY_QUERY_MAX_SQL_LENGTH,
} from "@mf-dashboard/db/queries/read-only-query";
import { describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";
import { createDatabaseQueryTool } from "./database-query-tool";

vi.mock("@mf-dashboard/db/queries/read-only-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@mf-dashboard/db/queries/read-only-query")>()),
  executeReadOnlyQuery: vi.fn<typeof executeReadOnlyQuery>(),
}));

const db = {} as Db;
const execOptions = {
  toolCallId: "test",
  messages: [],
  abortSignal: undefined as never,
  context: {} as never,
};

describe("createDatabaseQueryTool", () => {
  it("Drizzle schemaから物理テーブルとカラムを説明する", () => {
    const description = describeDatabaseSchema();

    expect(description).toContain("transactions(");
    expect(description).toContain("'income'が収入・入金");
    expect(description).toContain("'expense'が支出・出金");
    expect(description).toContain("収入合計から支出合計を引いた値");
    expect(description).toContain("sub_category text");
    expect(description).toContain("is_excluded_from_calculation integer NOT NULL");
    expect(description).toContain("group_accounts(");
    expect(description).toContain("現在グループの総資産はasset_history.group_id = :groupId");
    expect(description).toContain("評価額・数量・単価・前日比・含み損益はholding_values");
    expect(description).toContain("投資情報には主に「株式(現物)」「投資信託」");
    expect(description).toContain("no-group（group_id = '0'）の最新完了snapshot 1件");
    expect(description).toContain("最新snapshotが空なら過去の保有情報は含まれない");
    expect(description).toContain("daily_snapshots.group_idは選択中グループへ匿名化投影済み");
    expect(description).toContain("mf_idは匿名化のため常にNULL");
    expect(description).toContain("transactions.is_internal_transfer = 1");
    expect(description).not.toContain("transactionsRelations");
  });

  it("executorと同じSQL文字数上限を入力時に検証する", () => {
    const queryTool = createDatabaseQueryTool(db, "group-a");
    const inputSchema = queryTool.inputSchema as ZodType<{ sql: string }>;

    expect(queryTool.description).toContain(`SQLは最大${READ_ONLY_QUERY_MAX_SQL_LENGTH}文字`);
    expect(
      inputSchema.safeParse({
        sql: `SELECT '${"x".repeat(READ_ONLY_QUERY_MAX_SQL_LENGTH)}'`,
      }).success,
    ).toBe(false);
  });

  it("groupIdをAI入力に公開せずSQL実行時に渡す", async () => {
    const tool = createDatabaseQueryTool(db, "group-a");
    const abortController = new AbortController();
    vi.mocked(executeReadOnlyQuery).mockResolvedValue({
      columns: [],
      rows: [],
      rowCount: 0,
      truncated: false,
    });

    await tool.execute?.(
      { sql: "SELECT * FROM groups WHERE id = :groupId" },
      { ...execOptions, abortSignal: abortController.signal },
    );

    expect(executeReadOnlyQuery).toHaveBeenCalledWith(
      db,
      "SELECT * FROM groups WHERE id = :groupId",
      "group-a",
      undefined,
      abortController.signal,
    );
  });
});
