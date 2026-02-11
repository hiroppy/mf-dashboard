import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateText = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: any[]) => mockGenerateText(...args),
  Output: {
    object: vi.fn(({ schema }: any) => ({ type: "object", schema })),
  },
  stepCountIs: vi.fn((n: number) => ({ type: "stepCount", count: n })),
  tool: vi.fn((def: any) => def),
}));

vi.mock("../config.js", () => ({
  getModel: vi.fn(() => "mock-model"),
}));

vi.mock("./tools.js", () => ({
  createFinancialTools: vi.fn(() => ({ dbTool1: {}, dbTool2: {} })),
}));

vi.mock("./analysis-tools.js", () => ({
  createAnalysisTools: vi.fn(() => ({ analysisTool1: {}, analysisTool2: {} })),
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
    steps:
      toolCalls.length > 0 ? [{ toolCalls: toolCalls.map((name) => ({ toolName: name })) }] : [],
  };
}

function mockStage2Result(output: any) {
  return {
    output,
    steps: [{ toolCalls: [] }],
  };
}

describe("generateInsights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call createFinancialTools and createAnalysisTools with db and groupId", async () => {
    mockGenerateText
      .mockResolvedValueOnce(mockStage1Result("analysis memo", ["getFinancialMetrics"]))
      .mockResolvedValueOnce(mockStage2Result(validOutput));

    await generateInsights(mockDb, groupId);
    expect(createFinancialTools).toHaveBeenCalledWith(mockDb, groupId);
    expect(createAnalysisTools).toHaveBeenCalledWith(mockDb, groupId);
  });

  it("should call generateText twice (2-stage)", async () => {
    mockGenerateText
      .mockResolvedValueOnce(mockStage1Result("analysis memo"))
      .mockResolvedValueOnce(mockStage2Result(validOutput));

    await generateInsights(mockDb, groupId);
    expect(mockGenerateText).toHaveBeenCalledTimes(2);
  });

  it("should pass both dbTools and analysisTools to Stage 1", async () => {
    mockGenerateText
      .mockResolvedValueOnce(mockStage1Result("memo"))
      .mockResolvedValueOnce(mockStage2Result(validOutput));

    await generateInsights(mockDb, groupId);

    const stage1Args = mockGenerateText.mock.calls[0][0];
    expect(stage1Args.tools).toEqual({
      dbTool1: {},
      dbTool2: {},
      analysisTool1: {},
      analysisTool2: {},
    });
    expect(stage1Args).toHaveProperty("stopWhen");
    expect(stage1Args).toHaveProperty("system");
  });

  it("should pass Stage 1 memo in Stage 2 prompt", async () => {
    const memo = "Detailed financial analysis memo content";
    mockGenerateText
      .mockResolvedValueOnce(mockStage1Result(memo))
      .mockResolvedValueOnce(mockStage2Result(validOutput));

    await generateInsights(mockDb, groupId);

    const stage2Args = mockGenerateText.mock.calls[1][0];
    expect(stage2Args.prompt).toContain(memo);
  });

  it("should not pass tools to Stage 2", async () => {
    mockGenerateText
      .mockResolvedValueOnce(mockStage1Result("memo"))
      .mockResolvedValueOnce(mockStage2Result(validOutput));

    await generateInsights(mockDb, groupId);

    const stage2Args = mockGenerateText.mock.calls[1][0];
    expect(stage2Args.tools).toBeUndefined();
  });

  it("should pass output schema to Stage 2", async () => {
    mockGenerateText
      .mockResolvedValueOnce(mockStage1Result("memo"))
      .mockResolvedValueOnce(mockStage2Result(validOutput));

    await generateInsights(mockDb, groupId);

    const stage2Args = mockGenerateText.mock.calls[1][0];
    expect(stage2Args).toHaveProperty("output");
    expect(stage2Args).toHaveProperty("system");
  });

  it("should return structured insights from Stage 2 output", async () => {
    mockGenerateText
      .mockResolvedValueOnce(mockStage1Result("memo"))
      .mockResolvedValueOnce(mockStage2Result(validOutput));

    const result = await generateInsights(mockDb, groupId);
    expect(result).toEqual(validOutput);
  });

  it("should throw when Stage 2 output is null", async () => {
    mockGenerateText
      .mockResolvedValueOnce(mockStage1Result("memo"))
      .mockResolvedValueOnce(mockStage2Result(null));

    await expect(generateInsights(mockDb, groupId)).rejects.toThrow(
      "LLM did not produce structured output",
    );
  });

  it("should throw when Stage 2 output is undefined", async () => {
    mockGenerateText
      .mockResolvedValueOnce(mockStage1Result("memo"))
      .mockResolvedValueOnce(mockStage2Result(undefined));

    await expect(generateInsights(mockDb, groupId)).rejects.toThrow(
      "LLM did not produce structured output",
    );
  });

  it("should log Stage 1 and Stage 2 info", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    mockGenerateText
      .mockResolvedValueOnce(mockStage1Result("memo", ["getFinancialMetrics", "analyzeMoMTrend"]))
      .mockResolvedValueOnce(mockStage2Result(validOutput));

    await generateInsights(mockDb, groupId);

    expect(consoleSpy).toHaveBeenCalledWith(
      "[analytics] Stage 1 - Steps: 1, Tool calls: getFinancialMetrics, analyzeMoMTrend",
    );
    expect(consoleSpy).toHaveBeenCalledWith("[analytics] Stage 2 - Steps: 1");
    consoleSpy.mockRestore();
  });

  it("should log 'none' when Stage 1 has no tool calls", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    mockGenerateText
      .mockResolvedValueOnce(mockStage1Result("memo"))
      .mockResolvedValueOnce(mockStage2Result(validOutput));

    await generateInsights(mockDb, groupId);

    expect(consoleSpy).toHaveBeenCalledWith("[analytics] Stage 1 - Steps: 0, Tool calls: none");
    consoleSpy.mockRestore();
  });
});
