import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type AnyMock = (...args: any[]) => any;

const mockGenerateText = vi.fn<AnyMock>();

vi.mock("ai", () => ({
  generateText: (...args: any[]) => mockGenerateText(...args),
  Output: {
    object: vi.fn<AnyMock>(({ schema }: any) => ({ type: "object", schema })),
  },
  stepCountIs: vi.fn<AnyMock>((n: number) => ({ type: "stepCount", count: n })),
  tool: vi.fn<AnyMock>((def: any) => def),
}));

vi.mock("../config.js", () => ({
  getModel: vi.fn<AnyMock>(() => "mock-model"),
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

  afterEach(() => {
    vi.useRealTimers();
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

  it("should request concise insights without template labels", async () => {
    mockGenerateText
      .mockResolvedValueOnce(mockStage1Result("memo"))
      .mockResolvedValueOnce(mockStage2Result(validOutput));

    await generateInsights(mockDb, groupId);

    const stage2Args = mockGenerateText.mock.calls[1][0];
    expect(stage2Args.system).toContain("最初の1文で、その分野で最も重要な結論");
    expect(stage2Args.system).toContain("見出しやラベルを一切付けず");
    expect(stage2Args.system).toContain("短い語句＋コロン");
    expect(stage2Args.system).toContain("網羅性より重要度を優先する");
    expect(stage2Args.system).toContain("行動を変えるべき場合だけ");
    expect(stage2Args.system).toContain("重要性の高い事実だけを伝える");
    expect(stage2Args.system).toContain("推測、一般論、定型的な助言は書かない");
    expect(stage2Args.system).toContain("大きな変化はない");
    expect(stage2Args.system).toContain("改善効果の数値を作ること");
  });

  it("should use JST date context across UTC year boundary", async () => {
    vi.useFakeTimers({ now: new Date("2025-12-31T15:00:00.000Z") });
    mockGenerateText
      .mockResolvedValueOnce(mockStage1Result("memo"))
      .mockResolvedValueOnce(mockStage2Result(validOutput));

    await generateInsights(mockDb, groupId);

    const stage1Args = mockGenerateText.mock.calls[0][0];
    expect(stage1Args.prompt).toContain("今日は2026-01-01です");
    expect(stage1Args.system).toContain("今日は2026-01-01です");
    expect(stage1Args.system).toContain("当月2026-01");
    expect(stage1Args.system).toContain("最新の確定月は**2025-12**");
    expect(stage1Args.system).toContain("2025-12は2025-11比");
  });

  it("should return structured insights from Stage 2 output", async () => {
    mockGenerateText
      .mockResolvedValueOnce(mockStage1Result("memo"))
      .mockResolvedValueOnce(mockStage2Result(validOutput));

    const result = await generateInsights(mockDb, groupId);
    expect(result).toEqual(validOutput);
  });

  it("should remove leading labels from every generated insight", async () => {
    const labeledOutput = {
      summary: "結論：家計は安定しています。要点：支出も横ばいです。補足（例：臨時収入）です。",
      savingsInsight: "最重要結論：予備資金は十分です。",
      investmentInsight: "評価: 分散されています。",
      spendingInsight: "比較事実：支出は前月比で減少しました。",
      balanceInsight: "収支：黒字を維持しています。",
      liabilityInsight: "アクション：追加対応は不要です。",
    };
    mockGenerateText
      .mockResolvedValueOnce(mockStage1Result("memo"))
      .mockResolvedValueOnce(mockStage2Result(labeledOutput));

    const result = await generateInsights(mockDb, groupId);

    expect(result).toEqual({
      summary: "家計は安定しています。支出も横ばいです。補足（例、臨時収入）です。",
      savingsInsight: "予備資金は十分です。",
      investmentInsight: "分散されています。",
      spendingInsight: "支出は前月比で減少しました。",
      balanceInsight: "黒字を維持しています。",
      liabilityInsight: "追加対応は不要です。",
    });
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
