import type { Db } from "@mf-dashboard/db";
import { describe, expect, it, vi } from "vitest";
import { createTransactionSearchTool } from "./transaction-search-tool.js";

const { searchTransactions } = vi.hoisted(() => ({
  searchTransactions: vi.fn<(options: unknown, db: Db) => never[]>(() => []),
}));

vi.mock("@mf-dashboard/db", () => ({ searchTransactions }));

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
    };

    await tool.execute?.(options, execOptions);

    expect(searchTransactions).toHaveBeenCalledWith({ ...options, groupId: "group-a" }, db);
  });
});
