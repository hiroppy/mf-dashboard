import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type AnyMock = (...args: any[]) => any;

const mockGenerate = vi.fn<AnyMock>();

vi.mock("../generation.js", () => ({
  generate: (...args: any[]) => mockGenerate(...args),
}));

vi.mock("./tools.js", () => ({
  createFinancialTools: vi.fn<AnyMock>(() => ({ dbTool1: {}, dbTool2: {} })),
}));

vi.mock("./analysis-tools.js", () => ({
  createAnalysisTools: vi.fn<AnyMock>(() => ({ analysisTool1: {}, analysisTool2: {} })),
}));

const { generateInsights } = await import("./generator");
const { createFinancialTools } = await import("./tools.js");
const { createAnalysisTools } = await import("./analysis-tools.js");

const mockDb = {} as any;
const groupId = "test-group";

const validOutput = {
  summary: "summary",
  savingsInsight: "savings",
  investmentInsight: "investment",
  spendingInsight: "spending",
  balanceInsight: "balance",
  liabilityInsight: "liability",
};

function mockStage1Result(text: string, toolCalls: string[] = []) {
  return {
    text,
    model: "mock-stage-1-model",
    output: undefined,
    toolNames: toolCalls,
  };
}

function mockStage2Result(output: any) {
  return {
    text: JSON.stringify(output),
    model: "mock-stage-2-model",
    output,
    toolNames: [],
  };
}

describe("generateInsights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should call createFinancialTools and createAnalysisTools with db and groupId", async () => {
    mockGenerate
      .mockResolvedValueOnce(mockStage1Result("analysis memo", ["getFinancialMetrics"]))
      .mockResolvedValueOnce(mockStage2Result(validOutput));

    await generateInsights(mockDb, groupId);
    expect(createFinancialTools).toHaveBeenCalledWith(mockDb, groupId);
    expect(createAnalysisTools).toHaveBeenCalledWith(mockDb, groupId);
  });

  it("should call generate twice (2-stage)", async () => {
    mockGenerate
      .mockResolvedValueOnce(mockStage1Result("analysis memo"))
      .mockResolvedValueOnce(mockStage2Result(validOutput));

    await generateInsights(mockDb, groupId);
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });

  it("should pass both dbTools and analysisTools to Stage 1", async () => {
    mockGenerate
      .mockResolvedValueOnce(mockStage1Result("memo"))
      .mockResolvedValueOnce(mockStage2Result(validOutput));

    await generateInsights(mockDb, groupId);

    const stage1Args = mockGenerate.mock.calls[0][0];
    expect(stage1Args.tools).toEqual({
      dbTool1: {},
      dbTool2: {},
      analysisTool1: {},
      analysisTool2: {},
    });
    expect(stage1Args.maxSteps).toBe(10);
    expect(stage1Args.preloadTools).toContain("getFinancialMetrics");
    expect(stage1Args).toHaveProperty("system");
  });

  it("should pass Stage 1 memo in Stage 2 prompt", async () => {
    const memo = "Detailed financial analysis memo content";
    mockGenerate
      .mockResolvedValueOnce(mockStage1Result(memo))
      .mockResolvedValueOnce(mockStage2Result(validOutput));

    await generateInsights(mockDb, groupId);

    const stage2Args = mockGenerate.mock.calls[1][0];
    expect(stage2Args.prompt).toContain(memo);
  });

  it("should not pass tools to Stage 2", async () => {
    mockGenerate
      .mockResolvedValueOnce(mockStage1Result("memo"))
      .mockResolvedValueOnce(mockStage2Result(validOutput));

    await generateInsights(mockDb, groupId);

    const stage2Args = mockGenerate.mock.calls[1][0];
    expect(stage2Args.tools).toBeUndefined();
  });

  it("should pass output schema to Stage 2", async () => {
    mockGenerate
      .mockResolvedValueOnce(mockStage1Result("memo"))
      .mockResolvedValueOnce(mockStage2Result(validOutput));

    await generateInsights(mockDb, groupId);

    const stage2Args = mockGenerate.mock.calls[1][0];
    expect(stage2Args).toHaveProperty("schema");
    expect(stage2Args).toHaveProperty("system");
  });

  it("should use JST date context across UTC year boundary", async () => {
    vi.useFakeTimers({ now: new Date("2025-12-31T15:00:00.000Z") });
    mockGenerate
      .mockResolvedValueOnce(mockStage1Result("memo"))
      .mockResolvedValueOnce(mockStage2Result(validOutput));

    await generateInsights(mockDb, groupId);

    const stage1Args = mockGenerate.mock.calls[0][0];
    expect(stage1Args.prompt).toContain("今日は2026-01-01です");
    expect(stage1Args.system).toContain("今日は2026-01-01です");
    expect(stage1Args.system).toContain("当月2026-01");
    expect(stage1Args.system).toContain("最新の確定月は**2025-12**");
    expect(stage1Args.system).toContain("2025-12は2025-11比");
  });

  it("should return structured insights from Stage 2 output", async () => {
    mockGenerate
      .mockResolvedValueOnce(mockStage1Result("memo"))
      .mockResolvedValueOnce(mockStage2Result(validOutput));

    const result = await generateInsights(mockDb, groupId);
    expect(result).toEqual({ insights: validOutput, model: "mock-stage-2-model" });
  });

  it("should throw when Stage 2 output is null", async () => {
    mockGenerate
      .mockResolvedValueOnce(mockStage1Result("memo"))
      .mockResolvedValueOnce(mockStage2Result(null));

    await expect(generateInsights(mockDb, groupId)).rejects.toThrow(
      "LLM did not produce structured output",
    );
  });

  it("should throw when Stage 2 output is undefined", async () => {
    mockGenerate
      .mockResolvedValueOnce(mockStage1Result("memo"))
      .mockResolvedValueOnce(mockStage2Result(undefined));

    await expect(generateInsights(mockDb, groupId)).rejects.toThrow(
      "LLM did not produce structured output",
    );
  });

  it("should log Stage 1 and Stage 2 info", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    mockGenerate
      .mockResolvedValueOnce(mockStage1Result("memo", ["getFinancialMetrics", "analyzeMoMTrend"]))
      .mockResolvedValueOnce(mockStage2Result(validOutput));

    await generateInsights(mockDb, groupId);

    expect(consoleSpy).toHaveBeenCalledWith(
      "[analytics] Stage 1 - Tool calls: getFinancialMetrics, analyzeMoMTrend",
    );
    expect(consoleSpy).toHaveBeenCalledWith("[analytics] Stage 2 - Complete");
    consoleSpy.mockRestore();
  });

  it("should log 'none' when Stage 1 has no tool calls", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    mockGenerate
      .mockResolvedValueOnce(mockStage1Result("memo"))
      .mockResolvedValueOnce(mockStage2Result(validOutput));

    await generateInsights(mockDb, groupId);

    expect(consoleSpy).toHaveBeenCalledWith("[analytics] Stage 1 - Tool calls: none");
    consoleSpy.mockRestore();
  });
});
