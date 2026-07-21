import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type AnyMock = (...args: any[]) => any;

const mockSaveAnalyticsReport = vi.fn<AnyMock>();
const mockGenerateInsightsWithMetadata = vi.fn<AnyMock>();
const mockIsLLMEnabled = vi.fn<AnyMock>();

vi.mock("@mf-dashboard/db/repository/analytics", () => ({
  saveAnalyticsReport: (...args: any[]) => mockSaveAnalyticsReport(...args),
}));

vi.mock("./config.js", () => ({
  isLLMEnabled: () => mockIsLLMEnabled(),
}));

vi.mock("./insights/generator.js", () => ({
  generateInsightsWithMetadata: (...args: any[]) => mockGenerateInsightsWithMetadata(...args),
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
    expect(mockGenerateInsightsWithMetadata).not.toHaveBeenCalled();
    expect(mockSaveAnalyticsReport).not.toHaveBeenCalled();
  });

  it("should call generateInsights with db and groupId when LLM is enabled", async () => {
    mockIsLLMEnabled.mockReturnValue(true);
    mockGenerateInsightsWithMetadata.mockResolvedValue({
      model: "test-model",
      insights: {
        summary: "summary",
        savingsInsight: "savings",
        investmentInsight: null,
        spendingInsight: null,
        balanceInsight: null,
        liabilityInsight: null,
      },
    });

    await analyzeFinancialData(mockDb, groupId);

    expect(mockGenerateInsightsWithMetadata).toHaveBeenCalledWith(mockDb, groupId);
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
    mockGenerateInsightsWithMetadata.mockResolvedValue({ insights, model: "resolved-model" });

    const result = await analyzeFinancialData(mockDb, groupId);

    expect(result).toBe(true);
    expect(mockSaveAnalyticsReport).toHaveBeenCalledWith(mockDb, {
      groupId,
      date: "2025-06-15",
      insights,
      model: "resolved-model",
    });
  });

  it("should save report with JST date across UTC day boundary", async () => {
    vi.useFakeTimers({ now: new Date("2025-03-31T15:00:00.000Z") });
    mockIsLLMEnabled.mockReturnValue(true);
    const insights = {
      summary: "summary",
      savingsInsight: "savings",
      investmentInsight: null,
      spendingInsight: null,
      balanceInsight: null,
      liabilityInsight: null,
    };
    mockGenerateInsightsWithMetadata.mockResolvedValue({ insights, model: "test-model" });

    await analyzeFinancialData(mockDb, groupId);

    expect(mockSaveAnalyticsReport).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        date: "2025-04-01",
      }),
    );
  });

  it("should return false when all insight values are null", async () => {
    mockIsLLMEnabled.mockReturnValue(true);
    mockGenerateInsightsWithMetadata.mockResolvedValue({
      model: "test-model",
      insights: {
        summary: null,
        savingsInsight: null,
        investmentInsight: null,
        spendingInsight: null,
        balanceInsight: null,
        liabilityInsight: null,
      },
    });

    const result = await analyzeFinancialData(mockDb, groupId);

    expect(result).toBe(false);
    expect(mockSaveAnalyticsReport).not.toHaveBeenCalled();
  });

  it("should return false and not throw when generateInsights fails", async () => {
    mockIsLLMEnabled.mockReturnValue(true);
    mockGenerateInsightsWithMetadata.mockRejectedValue(new Error("LLM error"));

    const result = await analyzeFinancialData(mockDb, groupId);

    expect(result).toBe(false);
    expect(mockSaveAnalyticsReport).not.toHaveBeenCalled();
  });

  it("should use the model resolved by the backend for model field", async () => {
    mockIsLLMEnabled.mockReturnValue(true);
    mockGenerateInsightsWithMetadata.mockResolvedValue({
      model: "resolved-model",
      insights: {
        summary: "summary",
        savingsInsight: null,
        investmentInsight: null,
        spendingInsight: null,
        balanceInsight: null,
        liabilityInsight: null,
      },
    });
    process.env.AI_MODEL = "gpt-4o";

    const result = await analyzeFinancialData(mockDb, groupId);

    expect(result).toBe(true);
    expect(mockSaveAnalyticsReport).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        model: "resolved-model",
      }),
    );

    delete process.env.AI_MODEL;
  });
});
