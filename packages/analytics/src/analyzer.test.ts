import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSaveAnalyticsReport = vi.fn();
const mockGenerateInsights = vi.fn();
const mockIsLLMEnabled = vi.fn();

vi.mock("@moneyforward-daily-action/db/repository/analytics", () => ({
  saveAnalyticsReport: (...args: any[]) => mockSaveAnalyticsReport(...args),
}));

vi.mock("./config.js", () => ({
  isLLMEnabled: () => mockIsLLMEnabled(),
}));

vi.mock("./insights/generator.js", () => ({
  generateInsights: (...args: any[]) => mockGenerateInsights(...args),
}));

const { analyzeFinancialData } = await import("./analyzer");

const mockDb = {} as any;
const groupId = "test-group";

describe("analyzeFinancialData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should skip LLM when disabled", async () => {
    mockIsLLMEnabled.mockReturnValue(false);

    const result = await analyzeFinancialData(mockDb, groupId);

    expect(result).toBe(false);
    expect(mockGenerateInsights).not.toHaveBeenCalled();
    expect(mockSaveAnalyticsReport).not.toHaveBeenCalled();
  });

  it("should call generateInsights with db and groupId when LLM is enabled", async () => {
    mockIsLLMEnabled.mockReturnValue(true);
    mockGenerateInsights.mockResolvedValue({
      summary: "summary",
      savingsInsight: "savings",
      investmentInsight: null,
      spendingInsight: null,
      balanceInsight: null,
      liabilityInsight: null,
    });

    await analyzeFinancialData(mockDb, groupId);

    expect(mockGenerateInsights).toHaveBeenCalledWith(mockDb, groupId);
  });

  it("should save report on successful insights generation", async () => {
    mockIsLLMEnabled.mockReturnValue(true);
    const insights = {
      summary: "summary",
      savingsInsight: "savings",
      investmentInsight: "investment",
      spendingInsight: "spending",
      balanceInsight: "balance",
      liabilityInsight: "liability",
    };
    mockGenerateInsights.mockResolvedValue(insights);

    const result = await analyzeFinancialData(mockDb, groupId);

    expect(result).toBe(true);
    expect(mockSaveAnalyticsReport).toHaveBeenCalledWith(mockDb, {
      groupId,
      date: "2025-06-15",
      insights,
      model: null,
    });
  });

  it("should return false when all insight values are null", async () => {
    mockIsLLMEnabled.mockReturnValue(true);
    mockGenerateInsights.mockResolvedValue({
      summary: null,
      savingsInsight: null,
      investmentInsight: null,
      spendingInsight: null,
      balanceInsight: null,
      liabilityInsight: null,
    });

    const result = await analyzeFinancialData(mockDb, groupId);

    expect(result).toBe(false);
    expect(mockSaveAnalyticsReport).not.toHaveBeenCalled();
  });

  it("should return false and not throw when generateInsights fails", async () => {
    mockIsLLMEnabled.mockReturnValue(true);
    mockGenerateInsights.mockRejectedValue(new Error("LLM error"));

    const result = await analyzeFinancialData(mockDb, groupId);

    expect(result).toBe(false);
    expect(mockSaveAnalyticsReport).not.toHaveBeenCalled();
  });

  it("should use AI_MODEL env var for model field", async () => {
    mockIsLLMEnabled.mockReturnValue(true);
    mockGenerateInsights.mockResolvedValue({
      summary: "summary",
      savingsInsight: null,
      investmentInsight: null,
      spendingInsight: null,
      balanceInsight: null,
      liabilityInsight: null,
    });
    process.env.AI_MODEL = "gpt-4o";

    const result = await analyzeFinancialData(mockDb, groupId);

    expect(result).toBe(true);
    expect(mockSaveAnalyticsReport).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        model: "gpt-4o",
      }),
    );

    delete process.env.AI_MODEL;
  });
});
