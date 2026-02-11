import { describe, it, expect, vi } from "vitest";
import { createFinancialTools } from "./tools";

vi.mock("@moneyforward-daily-action/db", () => ({
  getAccountsWithAssets: vi.fn(() => [{ id: 1, name: "Account A" }]),
  getAccountsGroupedByCategory: vi.fn(() => []),
  getTransactionsByMonth: vi.fn(() => []),
  getHoldingsWithLatestValues: vi.fn(() => []),
  getHoldingsWithDailyChange: vi.fn(() => []),
  getMonthlySummaries: vi.fn(() => []),
  getMonthlySummaryByMonth: vi.fn(() => undefined),
  getMonthlyCategoryTotals: vi.fn(() => []),
  getExpenseByFixedVariable: vi.fn(() => ({ fixed: [], variable: [] })),
  getAvailableMonths: vi.fn(() => []),
  getYearToDateSummary: vi.fn(() => ({
    year: 2025,
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    monthCount: 0,
  })),
  getLatestMonthlySummary: vi.fn(() => undefined),
  getAssetBreakdownByCategory: vi.fn(() => []),
  getLiabilityBreakdownByCategory: vi.fn(() => []),
  getAssetHistory: vi.fn(() => []),
  getLatestTotalAssets: vi.fn(() => 5000000),
  getDailyAssetChange: vi.fn(() => null),
  getCategoryChangesForPeriod: vi.fn(() => null),
  getFinancialMetrics: vi.fn(() => null),
}));

const {
  getAccountsWithAssets,
  getTransactionsByMonth,
  getMonthlySummaries,
  getAssetHistory,
  getYearToDateSummary,
  getCategoryChangesForPeriod,
} = await import("@moneyforward-daily-action/db");

const mockDb = {} as any;
const groupId = "test-group";

describe("createFinancialTools", () => {
  it("should return all 19 tools", () => {
    const tools = createFinancialTools(mockDb, groupId);
    expect(Object.keys(tools)).toHaveLength(19);
  });

  it("should have descriptions and inputSchema for each tool", () => {
    const tools = createFinancialTools(mockDb, groupId);
    for (const [, t] of Object.entries(tools)) {
      expect(t).toHaveProperty("description");
      expect(t).toHaveProperty("inputSchema");
      expect((t as any).description).toBeTruthy();
    }
  });

  it("should pass groupId and db to parameterless tools", async () => {
    const tools = createFinancialTools(mockDb, groupId);
    await tools.getAccountsWithAssets.execute!(
      {},
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );
    expect(getAccountsWithAssets).toHaveBeenCalledWith(groupId, mockDb);
  });

  it("should pass month parameter to getTransactionsByMonth", async () => {
    const tools = createFinancialTools(mockDb, groupId);
    await tools.getTransactionsByMonth.execute!(
      { month: "2025-01" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );
    expect(getTransactionsByMonth).toHaveBeenCalledWith("2025-01", groupId, mockDb);
  });

  it("should pass limit to getMonthlySummaries", async () => {
    const tools = createFinancialTools(mockDb, groupId);
    await tools.getMonthlySummaries.execute!(
      { limit: 6 },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );
    expect(getMonthlySummaries).toHaveBeenCalledWith({ limit: 6, groupId }, mockDb);
  });

  it("should pass limit to getAssetHistory", async () => {
    const tools = createFinancialTools(mockDb, groupId);
    await tools.getAssetHistory.execute!(
      { limit: 30 },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );
    expect(getAssetHistory).toHaveBeenCalledWith({ limit: 30, groupId }, mockDb);
  });

  it("should pass year to getYearToDateSummary", async () => {
    const tools = createFinancialTools(mockDb, groupId);
    await tools.getYearToDateSummary.execute!(
      { year: 2024 },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );
    expect(getYearToDateSummary).toHaveBeenCalledWith({ year: 2024, groupId }, mockDb);
  });

  it("should pass period to getCategoryChangesForPeriod", async () => {
    const tools = createFinancialTools(mockDb, groupId);
    await tools.getCategoryChangesForPeriod.execute!(
      { period: "weekly" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );
    expect(getCategoryChangesForPeriod).toHaveBeenCalledWith("weekly", groupId, mockDb);
  });
});
