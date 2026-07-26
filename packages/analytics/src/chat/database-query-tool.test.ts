import type { Db } from "@mf-dashboard/db";
import {
  describeDatabaseSchema,
  executeReadOnlyQuery,
  READ_ONLY_QUERY_MAX_SQL_LENGTH,
} from "@mf-dashboard/db/queries/read-only-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    expect(description).toContain("「最も赤字幅が大きい」は合計値を昇順に並べる");
    expect(description).toContain("holding_values.amount（評価額）を損失として扱わない");
    expect(description).toContain("投資情報には主に「株式(現物)」「投資信託」");
    expect(description).toContain("no-group（group_id = '0'）の最新完了snapshot 1件");
    expect(description).toContain("最新snapshotが空なら過去の保有情報は含まれない");
    expect(description).toContain("daily_snapshots.group_idは選択中グループへ匿名化投影済み");
    expect(description).toContain(
      "金融機関を特定できない保有資産はholdings.account_id = NULLで含まれる",
    );
    expect(description).toContain("group_accountsで再度絞り込まない");
    expect(description).not.toContain("holdings.account_idをgroup_accounts経由で絞る");
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

  it("全chat requestを通じて同時query subprocessを2件に制限する", async () => {
    const releases: Array<() => void> = [];
    vi.mocked(executeReadOnlyQuery).mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() => resolve({ columns: [], rows: [], rowCount: 0, truncated: false }));
        }),
    );
    const tools = Array.from({ length: 4 }, () => createDatabaseQueryTool(db, "group-a"));
    const executions = tools.map((queryTool, index) =>
      Promise.resolve(queryTool.execute!({ sql: `SELECT ${index}` }, execOptions)),
    );

    await vi.waitFor(() => expect(executeReadOnlyQuery).toHaveBeenCalledTimes(2));
    releases.splice(0).forEach((release) => release());
    await vi.waitFor(() => expect(executeReadOnlyQuery).toHaveBeenCalledTimes(4));
    releases.splice(0).forEach((release) => release());

    await expect(Promise.all(executions)).resolves.toHaveLength(4);
  });

  it("待機中にrequestがabortされたqueryを実行しない", async () => {
    const releases: Array<() => void> = [];
    vi.mocked(executeReadOnlyQuery).mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() => resolve({ columns: [], rows: [], rowCount: 0, truncated: false }));
        }),
    );
    const runningTools = Array.from({ length: 2 }, () => createDatabaseQueryTool(db, "group-a"));
    const running = runningTools.map((queryTool) =>
      Promise.resolve(queryTool.execute!({ sql: "SELECT 1" }, execOptions)),
    );
    await vi.waitFor(() => expect(executeReadOnlyQuery).toHaveBeenCalledTimes(2));

    const abortController = new AbortController();
    const waiting = Promise.resolve(
      createDatabaseQueryTool(db, "group-a").execute!(
        { sql: "SELECT 2" },
        { ...execOptions, abortSignal: abortController.signal },
      ),
    );
    const abortReason = new Error("request aborted");
    abortController.abort(abortReason);

    await expect(waiting).rejects.toBe(abortReason);
    expect(executeReadOnlyQuery).toHaveBeenCalledTimes(2);
    releases.splice(0).forEach((release) => release());
    await Promise.all(running);
  });
});
