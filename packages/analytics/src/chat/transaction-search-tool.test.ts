import type { Db } from "@mf-dashboard/db";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createTransactionSearchTool } from "./transaction-search-tool.js";

const { searchTransactions } = vi.hoisted(() => ({
  searchTransactions: vi.fn<(options: unknown, db: Db) => never[]>(() => []),
}));

vi.mock("@mf-dashboard/db", () => ({
  searchTransactions,
  SEARCH_TRANSACTIONS_MAX_LIMIT: 100,
  SEARCH_TRANSACTIONS_MAX_OFFSET: 10_000,
}));

const db = {} as Db;
const execOptions = {
  toolCallId: "test",
  messages: [],
  abortSignal: undefined as never,
  context: {} as never,
};

describe("createTransactionSearchTool", () => {
  it("groupIdを外部入力にせず検索条件へ必ず付与する", async () => {
    const tool = createTransactionSearchTool(db, "group-a");
    const options = {
      month: "2025-06",
      category: "食費",
      minAmount: 10000,
      includeTransfers: false,
      includeExcluded: false,
      limit: 25,
      offset: 50,
    };

    await tool.execute?.(options, execOptions);

    expect(searchTransactions).toHaveBeenCalledWith({ ...options, groupId: "group-a" }, db);
  });

  it.each(["2025-00", "2025-13", "2025-1"])("不正な月 %s を拒否する", (month) => {
    const tool = createTransactionSearchTool(db, "group-a");
    const schema = tool.inputSchema as z.ZodType;

    expect(schema.safeParse({ month }).success).toBe(false);
  });

  it("開始日が終了日より後の期間を拒否する", () => {
    const tool = createTransactionSearchTool(db, "group-a");
    const schema = tool.inputSchema as z.ZodType;

    expect(schema.safeParse({ startDate: "2026-07-31", endDate: "2026-07-01" }).success).toBe(
      false,
    );
    expect(schema.safeParse({ startDate: "2026-07-01", endDate: "2026-07-31" }).success).toBe(true);
  });
});
