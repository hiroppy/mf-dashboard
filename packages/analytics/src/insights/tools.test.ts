import { describe, it, expect, vi } from "vitest";
import { createFinancialTools } from "./tools";

type AnyMock = (...args: any[]) => any;

vi.mock("@mf-dashboard/db", () => ({
  getAccountsWithAssets: vi.fn<AnyMock>(() => [{ id: 1, name: "Account A" }]),
  getAccountsGroupedByCategory: vi.fn<AnyMock>(() => []),
  getTransactionsByMonth: vi.fn<AnyMock>(() => []),
  getTransactionsByAccountId: vi.fn<AnyMock>(() => []),
  getHoldingsWithLatestValues: vi.fn<AnyMock>(() => []),
  getHoldingsWithDailyChange: vi.fn<AnyMock>(() => []),
  getHoldingsByAccountId: vi.fn<AnyMock>(() => []),
  getMonthlySummaries: vi.fn<AnyMock>(() => []),
  getMonthlySummaryByMonth: vi.fn<AnyMock>(() => undefined),
  getMonthlyCategoryTotals: vi.fn<AnyMock>(() => []),
  getExpenseByFixedVariable: vi.fn<AnyMock>(() => ({ fixed: [], variable: [] })),
  getAvailableMonths: vi.fn<AnyMock>(() => []),
  getYearToDateSummary: vi.fn<AnyMock>(() => ({
    year: 2025,
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    monthCount: 0,
  })),
  getLatestMonthlySummary: vi.fn<AnyMock>(() => undefined),
  getAssetBreakdownByCategory: vi.fn<AnyMock>(() => []),
  getLiabilityBreakdownByCategory: vi.fn<AnyMock>(() => []),
  getAssetHistory: vi.fn<AnyMock>(() => []),
  getAssetHistoryWithCategories: vi.fn<AnyMock>(() => []),
  getLatestTotalAssets: vi.fn<AnyMock>(() => 5000000),
  getDailyAssetChange: vi.fn<AnyMock>(() => null),
  getCategoryChangesForPeriod: vi.fn<AnyMock>(() => null),
  getFinancialMetrics: vi.fn<AnyMock>(() => null),
  getLatestAnalytics: vi.fn<AnyMock>(() => null),
}));

const {
  getAccountsWithAssets,
  getTransactionsByMonth,
  getTransactionsByAccountId,
  getHoldingsByAccountId,
  getMonthlySummaries,
  getAssetHistory,
  getAssetHistoryWithCategories,
  getYearToDateSummary,
  getCategoryChangesForPeriod,
  getLatestAnalytics,
} = await import("@mf-dashboard/db");

const mockDb = {} as any;
const groupId = "test-group";

describe("createFinancialTools", () => {
  it("should return all 23 tools", () => {
    const tools = createFinancialTools(mockDb, groupId);
    expect(Object.keys(tools)).toHaveLength(23);
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

  it("should pass accountId to getHoldingsByAccountId", async () => {
    const tools = createFinancialTools(mockDb, groupId);
    await tools.getHoldingsByAccountId.execute!(
      { accountId: 42 },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );
    expect(getHoldingsByAccountId).toHaveBeenCalledWith(42, groupId, mockDb);
  });

  it("should pass accountId to getTransactionsByAccountId", async () => {
    const tools = createFinancialTools(mockDb, groupId);
    await tools.getTransactionsByAccountId.execute!(
      { accountId: 7 },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );
    expect(getTransactionsByAccountId).toHaveBeenCalledWith(7, groupId, mockDb);
  });

  it("should pass limit to getAssetHistoryWithCategories", async () => {
    const tools = createFinancialTools(mockDb, groupId);
    await tools.getAssetHistoryWithCategories.execute!(
      { limit: 10 },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );
    expect(getAssetHistoryWithCategories).toHaveBeenCalledWith({ limit: 10, groupId }, mockDb);
  });

  it("should call getLatestAnalytics with no extra params", async () => {
    const tools = createFinancialTools(mockDb, groupId);
    await tools.getLatestAnalytics.execute!(
      {},
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );
    expect(getLatestAnalytics).toHaveBeenCalledWith(groupId, mockDb);
  });
});
