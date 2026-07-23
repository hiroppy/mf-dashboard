import { describeDatabaseSchema, executeReadOnlyQuery, type Db } from "@mf-dashboard/db";
import { describe, expect, it, vi } from "vitest";
import { createDatabaseQueryTool } from "./database-query-tool";

vi.mock("@mf-dashboard/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@mf-dashboard/db")>()),
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
    expect(description).toContain("'income'だけが収入・入金");
    expect(description).toContain("'expense'だけが支出・出金");
    expect(description).toContain("収支は収入合計から支出合計を引いた値");
    expect(description).toContain("sub_category text");
    expect(description).toContain("is_excluded_from_calculation integer NOT NULL");
    expect(description).toContain("group_accounts(");
    expect(description).toContain("現在グループの総資産はasset_history.group_id = :groupId");
    expect(description).toContain("評価額・数量・単価・前日比・含み損益はholding_values");
    expect(description).toContain("投資情報には主に「株式(現物)」「投資信託」");
    expect(description).toContain("refresh_completed = 1");
    expect(description).toContain("daily_snapshots.group_id = :groupIdを使用してはいけない");
    expect(description).not.toContain("transactionsRelations");
  });

  it("groupIdをAI入力に公開せずSQL実行時に渡す", async () => {
    const tool = createDatabaseQueryTool(db, "group-a");
    vi.mocked(executeReadOnlyQuery).mockResolvedValue({
      columns: [],
      rows: [],
      rowCount: 0,
      truncated: false,
    });

    await tool.execute?.({ sql: "SELECT * FROM groups WHERE id = :groupId" }, execOptions);

    expect(executeReadOnlyQuery).toHaveBeenCalledWith(
      db,
      "SELECT * FROM groups WHERE id = :groupId",
      "group-a",
    );
  });
});
