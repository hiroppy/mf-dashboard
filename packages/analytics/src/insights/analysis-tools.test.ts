import { describe, it, expect, vi } from "vitest";
import { createAnalysisTools } from "./analysis-tools";

// Fix time to 2025-03-15 so that "2025-03" is the current month and test data (2025-01, 2025-02) passes through
vi.useFakeTimers({ now: new Date("2025-03-15T12:00:00Z") });

vi.mock("@mf-dashboard/db", () => ({
  getMonthlySummaries: vi.fn(() => [
    { month: "2025-02", totalIncome: 310000, totalExpense: 210000, netIncome: 100000 },
    { month: "2025-01", totalIncome: 300000, totalExpense: 200000, netIncome: 100000 },
  ]),
  getMonthlyCategoryTotals: vi.fn(() => [
    { month: "2025-02", category: "食費", type: "expense", totalAmount: 50000 },
  ]),
  getHoldingsWithLatestValues: vi.fn(() => [
    { name: "Stock A", amount: 500000, unrealizedGain: 50000, unrealizedGainPct: 10 },
  ]),
  getHoldingsWithDailyChange: vi.fn(() => [{ name: "Stock A", dailyChange: -5000 }]),
  getFinancialMetrics: vi.fn(() => ({
    savings: {
      totalAssets: 5000000,
      liquidAssets: 2000000,
      monthlyExpenseAvg: 200000,
      emergencyFundMonths: 10,
    },
    investment: { diversificationScore: 50 },
  })),
  getAvailableMonths: vi.fn(() => [{ month: "2025-02" }, { month: "2025-01" }]),
}));

vi.mock("./analyze-mom-trend.js", () => ({
  analyzeMoMTrend: vi.fn(() => ({ overallTrend: "stable" })),
}));

vi.mock("./analyze-spending-comparison.js", () => ({
  analyzeSpendingComparison: vi.fn(() => ({ categories: [], newCategories: [] })),
}));

vi.mock("./analyze-portfolio-risk.js", () => ({
  analyzePortfolioRisk: vi.fn(() => ({ riskLevel: "low" })),
}));

vi.mock("./analyze-savings-trajectory.js", () => ({
  analyzeSavingsTrajectory: vi.fn(() => ({ direction: "stable" })),
}));

vi.mock("./analyze-income-stability.js", () => ({
  analyzeIncomeStability: vi.fn(() => ({ stability: "stable" })),
}));

const {
  getMonthlySummaries,
  getHoldingsWithLatestValues,
  getHoldingsWithDailyChange,
  getFinancialMetrics,
  getAvailableMonths,
  getMonthlyCategoryTotals,
} = await import("@mf-dashboard/db");

const { analyzeMoMTrend } = await import("./analyze-mom-trend.js");
const { analyzeSpendingComparison } = await import("./analyze-spending-comparison.js");
const { analyzePortfolioRisk } = await import("./analyze-portfolio-risk.js");
const { analyzeSavingsTrajectory } = await import("./analyze-savings-trajectory.js");
const { analyzeIncomeStability } = await import("./analyze-income-stability.js");

const mockDb = {} as any;
const groupId = "test-group";
const execOpts = { toolCallId: "test", messages: [], abortSignal: undefined as any };

describe("createAnalysisTools", () => {
  it("should return all 5 analysis tools", () => {
    const tools = createAnalysisTools(mockDb, groupId);
    expect(Object.keys(tools)).toHaveLength(5);
    expect(tools).toHaveProperty("analyzeMoMTrend");
    expect(tools).toHaveProperty("analyzeSpendingComparison");
    expect(tools).toHaveProperty("analyzePortfolioRisk");
    expect(tools).toHaveProperty("analyzeSavingsTrajectory");
    expect(tools).toHaveProperty("analyzeIncomeStability");
  });

  it("should have descriptions for each tool", () => {
    const tools = createAnalysisTools(mockDb, groupId);
    for (const [, t] of Object.entries(tools)) {
      expect(t).toHaveProperty("description");
      expect((t as any).description).toBeTruthy();
    }
  });

  it("analyzeMoMTrend should fetch summaries and call analyzer", async () => {
    const tools = createAnalysisTools(mockDb, groupId);
    await tools.analyzeMoMTrend.execute!({}, execOpts);
    expect(getMonthlySummaries).toHaveBeenCalledWith({ groupId }, mockDb);
    expect(analyzeMoMTrend).toHaveBeenCalled();
  });

  it("analyzeSpendingComparison should fetch category totals and call analyzer", async () => {
    const tools = createAnalysisTools(mockDb, groupId);
    await tools.analyzeSpendingComparison.execute!({}, execOpts);
    expect(getAvailableMonths).toHaveBeenCalledWith(groupId, mockDb);
    expect(getMonthlyCategoryTotals).toHaveBeenCalled();
    expect(analyzeSpendingComparison).toHaveBeenCalled();
  });

  it("analyzePortfolioRisk should fetch holdings, daily changes, and metrics", async () => {
    const tools = createAnalysisTools(mockDb, groupId);
    await tools.analyzePortfolioRisk.execute!({}, execOpts);
    expect(getHoldingsWithLatestValues).toHaveBeenCalledWith(groupId, mockDb);
    expect(getHoldingsWithDailyChange).toHaveBeenCalledWith(groupId, mockDb);
    expect(getFinancialMetrics).toHaveBeenCalledWith(groupId, mockDb);
    expect(analyzePortfolioRisk).toHaveBeenCalled();
  });

  it("analyzeSavingsTrajectory should fetch metrics and all summaries", async () => {
    const tools = createAnalysisTools(mockDb, groupId);
    await tools.analyzeSavingsTrajectory.execute!({}, execOpts);
    expect(getFinancialMetrics).toHaveBeenCalledWith(groupId, mockDb);
    expect(getMonthlySummaries).toHaveBeenCalledWith({ groupId }, mockDb);
    expect(analyzeSavingsTrajectory).toHaveBeenCalled();
  });

  it("analyzeIncomeStability should fetch summaries and call analyzer", async () => {
    const tools = createAnalysisTools(mockDb, groupId);
    await tools.analyzeIncomeStability.execute!({}, execOpts);
    expect(getMonthlySummaries).toHaveBeenCalledWith({ groupId }, mockDb);
    expect(analyzeIncomeStability).toHaveBeenCalled();
  });

  it("analyzeMoMTrend should exclude current month data", async () => {
    vi.mocked(getMonthlySummaries).mockResolvedValueOnce([
      { month: "2025-03", totalIncome: 50000, totalExpense: 30000, netIncome: 20000 },
      { month: "2025-02", totalIncome: 310000, totalExpense: 210000, netIncome: 100000 },
      { month: "2025-01", totalIncome: 300000, totalExpense: 200000, netIncome: 100000 },
    ]);
    const tools = createAnalysisTools(mockDb, groupId);
    await tools.analyzeMoMTrend.execute!({}, execOpts);
    expect(analyzeMoMTrend).toHaveBeenCalledWith([
      { month: "2025-02", totalIncome: 310000, totalExpense: 210000, netIncome: 100000 },
      { month: "2025-01", totalIncome: 300000, totalExpense: 200000, netIncome: 100000 },
    ]);
  });

  it("analyzeSpendingComparison should exclude current month from available months", async () => {
    vi.mocked(getAvailableMonths).mockResolvedValueOnce([
      { month: "2025-03" },
      { month: "2025-02" },
      { month: "2025-01" },
    ]);
    const tools = createAnalysisTools(mockDb, groupId);
    await tools.analyzeSpendingComparison.execute!({}, execOpts);
    expect(analyzeSpendingComparison).toHaveBeenCalledWith(expect.anything(), "2025-02");
  });
});
