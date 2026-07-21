import type { Db } from "@mf-dashboard/db";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createTransactionSearchTool } from "./transaction-search-tool.js";

const { searchTransactionsWithMetadata } = vi.hoisted(() => ({
  searchTransactionsWithMetadata: vi.fn<
    (options: unknown, db: Db) => { transactions: never[]; truncated: boolean }
  >(() => ({ transactions: [], truncated: false })),
}));

vi.mock("@mf-dashboard/db", () => ({
  searchTransactionsWithMetadata,
  SEARCH_TRANSACTIONS_MAX_LIMIT: 100,
  SEARCH_TRANSACTIONS_MAX_OFFSET: 900,
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

    expect(searchTransactionsWithMetadata).toHaveBeenCalledWith(
      { ...options, groupId: "group-a" },
      db,
    );
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

  it("最小金額が最大金額より大きい範囲を拒否する", () => {
    const tool = createTransactionSearchTool(db, "group-a");
    const schema = tool.inputSchema as z.ZodType;

    expect(schema.safeParse({ minAmount: 2_000, maxAmount: 1_000 }).success).toBe(false);
    expect(schema.safeParse({ minAmount: 1_000, maxAmount: 1_000 }).success).toBe(true);
  });

  it.each(["", "   "])("空の検索filter %jを拒否する", (filter) => {
    const schema = createTransactionSearchTool(db, "group-a").inputSchema as z.ZodType;

    for (const name of ["category", "subCategory", "keyword"]) {
      expect(schema.safeParse({ [name]: filter }).success).toBe(false);
    }
  });
});
