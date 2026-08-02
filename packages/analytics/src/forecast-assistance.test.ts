import { generateText } from "ai";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { isLLMEnabled } from "./config.js";
import {
  assistForecastCandidate,
  generateForecastAssistanceWithLLM,
  getBusinessDayShiftCandidates,
  type ForecastCandidateFeatures,
  type ForecastLLMDecider,
} from "./forecast-assistance.js";

vi.mock("ai", () => ({
  generateText: vi.fn<() => Promise<unknown>>(),
  Output: {
    object: vi.fn<(value: unknown) => unknown>((value) => value),
  },
}));

vi.mock("./config.js", () => ({
  getModel: vi.fn<() => string>(() => "mock-model"),
  isLLMEnabled: vi.fn<() => boolean>(),
}));

const salaryCandidate: ForecastCandidateFeatures = {
  candidateId: "candidate-a",
  direction: "income",
  occurrenceCount: 3,
  observedDayRange: [24, 26],
  amountBand: "large",
  nominalDate: "2026-10-25",
  matchedSignals: ["salary"],
};

afterEach(() => {
  vi.useRealTimers();
});

describe("getBusinessDayShiftCandidates", () => {
  test("25日が休日の場合は前営業日と翌営業日を候補にする", () => {
    expect(getBusinessDayShiftCandidates("2026-10-25")).toEqual([
      { date: "2026-10-23", adjustment: "previous_business_day" },
      { date: "2026-10-26", adjustment: "next_business_day" },
    ]);
  });

  test("追加の休日を飛ばして営業日を探す", () => {
    expect(getBusinessDayShiftCandidates("2026-10-25", ["2026-10-26"])).toEqual([
      { date: "2026-10-23", adjustment: "previous_business_day" },
      { date: "2026-10-27", adjustment: "next_business_day" },
    ]);
  });

  test("平日は元の日付だけを候補にする", () => {
    expect(getBusinessDayShiftCandidates("2026-09-25")).toEqual([
      { date: "2026-09-25", adjustment: "none" },
    ]);
  });
});

describe("assistForecastCandidate", () => {
  test("LLMなしでもルール分類と休日ズレ候補を返す", async () => {
    const llmDecider = vi.fn<ForecastLLMDecider>().mockResolvedValue(null);

    const result = await assistForecastCandidate(salaryCandidate, llmDecider);

    expect(result.classification).toEqual({
      label: "salary",
      confidence: 0.9,
      reason: "匿名化済みのsalaryシグナルと過去3回の出現に基づく分類です。",
      source: "rule",
    });
    expect(result.dateCandidates).toHaveLength(2);
    expect(result.suggestedDateAdjustment).toBeNull();
    expect(result.reviewRequired).toBe(false);
  });

  test("LLMありの場合は分類ラベル・信頼度・根拠と日付推奨を補強する", async () => {
    const llmDecider = vi.fn<ForecastLLMDecider>().mockResolvedValue({
      candidateId: "candidate-a",
      classification: "salary",
      confidence: 0.82,
      reason: "月末前の定期入金で、休日は前営業日に寄る可能性があります。",
      dateAdjustment: "previous_business_day",
    });

    const result = await assistForecastCandidate(salaryCandidate, llmDecider);

    expect(llmDecider).toHaveBeenCalledWith(
      salaryCandidate,
      expect.arrayContaining([{ date: "2026-10-25", adjustment: "none" }]),
    );
    expect(result.classification).toEqual({
      label: "salary",
      confidence: 0.82,
      reason: "月末前の定期入金で、休日は前営業日に寄る可能性があります。",
      source: "llm",
    });
    expect(result.suggestedDateAdjustment).toBe("previous_business_day");
    expect(result.dateCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ adjustment: "previous_business_day" }),
        expect.objectContaining({ adjustment: "next_business_day" }),
      ]),
    );
  });

  test("LLMが給与へ補強した場合は休日ズレ候補を再計算する", async () => {
    const unclassifiedCandidate = {
      ...salaryCandidate,
      matchedSignals: [],
    };
    const llmDecider = vi.fn<ForecastLLMDecider>().mockResolvedValue({
      candidateId: "candidate-a",
      classification: "salary",
      confidence: 0.8,
      reason: "出現日と金額帯から給与候補と判断しました。",
      dateAdjustment: "next_business_day",
    });

    const result = await assistForecastCandidate(unclassifiedCandidate, llmDecider);

    expect(llmDecider).toHaveBeenCalledWith(
      unclassifiedCandidate,
      expect.arrayContaining([
        { date: "2026-10-23", adjustment: "previous_business_day" },
        { date: "2026-10-26", adjustment: "next_business_day" },
      ]),
    );
    expect(result.classification).toMatchObject({ label: "salary", source: "llm" });
    expect(result.dateCandidates).toEqual([
      { date: "2026-10-23", adjustment: "previous_business_day" },
      { date: "2026-10-26", adjustment: "next_business_day" },
    ]);
    expect(result.suggestedDateAdjustment).toBe("next_business_day");
  });

  test("直近1回のみの新規大口入金を要確認として説明する", async () => {
    const result = await assistForecastCandidate(
      {
        ...salaryCandidate,
        occurrenceCount: 1,
        matchedSignals: [],
      },
      async () => null,
    );

    expect(result.reviewRequired).toBe(true);
    expect(result.reviewReason).toContain("直近1回");
    expect(result.classification).toMatchObject({
      label: "other",
      source: "rule",
    });
  });

  test("LLM例外と曖昧または候補外の日付推奨は安全に無視する", async () => {
    const failingResult = await assistForecastCandidate(salaryCandidate, async () => {
      throw new Error("provider failure");
    });
    const invalidResult = await assistForecastCandidate(salaryCandidate, async () => ({
      candidateId: "candidate-a",
      classification: "salary",
      confidence: 1,
      reason: "unsupported adjustment",
      dateAdjustment: "none",
    }));
    const ambiguousResult = await assistForecastCandidate(salaryCandidate, async () => ({
      candidateId: "candidate-a",
      classification: "salary",
      confidence: 0.59,
      reason: "low confidence",
      dateAdjustment: "previous_business_day",
    }));

    expect(failingResult.classification.source).toBe("rule");
    expect(invalidResult.classification.source).toBe("rule");
    expect(ambiguousResult.classification.source).toBe("rule");
  });

  test("収支方向と矛盾するルールとLLM分類を無視する", async () => {
    const expenseCandidate = {
      ...salaryCandidate,
      direction: "expense" as const,
    };

    const result = await assistForecastCandidate(expenseCandidate, async () => ({
      candidateId: "candidate-a",
      classification: "salary",
      confidence: 0.9,
      reason: "incompatible direction",
      dateAdjustment: "previous_business_day",
    }));

    expect(result.classification).toMatchObject({ label: "other", source: "rule" });
    expect(result.dateCandidates).toEqual([{ date: "2026-10-25", adjustment: "none" }]);
  });

  test("LLMがtimeoutした場合はルール結果を返す", async () => {
    vi.useFakeTimers();
    const stalledDecider = vi.fn<ForecastLLMDecider>(() => new Promise(() => {}));

    const resultPromise = assistForecastCandidate(salaryCandidate, stalledDecider, 100);
    await vi.advanceTimersByTimeAsync(100);

    await expect(resultPromise).resolves.toMatchObject({
      classification: { label: "salary", source: "rule" },
    });
  });
});

describe("generateForecastAssistanceWithLLM", () => {
  beforeEach(() => {
    vi.mocked(isLLMEnabled).mockReturnValue(true);
    vi.mocked(generateText).mockReset();
  });

  test("LLM設定がない場合は呼び出さずnullを返す", async () => {
    vi.mocked(isLLMEnabled).mockReturnValue(false);

    const result = await generateForecastAssistanceWithLLM(salaryCandidate, [
      { date: "2026-10-23", adjustment: "previous_business_day" },
    ]);

    expect(result).toBeNull();
    expect(generateText).not.toHaveBeenCalled();
  });

  test("不正または候補と整合しない出力をschema validation後に無視する", async () => {
    vi.mocked(generateText)
      .mockResolvedValueOnce({
        output: {
          candidateId: "candidate-a",
          classification: "salary",
          confidence: 2,
          reason: "invalid confidence",
          dateAdjustment: "previous_business_day",
        },
      } as Awaited<ReturnType<typeof generateText>>)
      .mockResolvedValueOnce({
        output: {
          candidateId: "candidate-b",
          classification: "salary",
          confidence: 0.8,
          reason: "wrong candidate",
          dateAdjustment: "previous_business_day",
        },
      } as Awaited<ReturnType<typeof generateText>>);
    const dateCandidates = [{ date: "2026-10-23", adjustment: "previous_business_day" as const }];

    expect(await generateForecastAssistanceWithLLM(salaryCandidate, dateCandidates)).toBeNull();
    expect(await generateForecastAssistanceWithLLM(salaryCandidate, dateCandidates)).toBeNull();
  });

  test("プロンプトには匿名化済み特徴量だけを渡す", async () => {
    const candidateWithUntrustedExtras = {
      ...salaryCandidate,
      description: "Test User 給与振込",
      accountName: "Bank A personal account",
      amount: 500_000,
    };
    vi.mocked(generateText).mockResolvedValue({
      output: {
        candidateId: "candidate-a",
        classification: "salary",
        confidence: 0.8,
        reason: "定期的な大口入金です。",
        dateAdjustment: "previous_business_day",
      },
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await generateForecastAssistanceWithLLM(candidateWithUntrustedExtras, [
      { date: "2026-10-23", adjustment: "previous_business_day" },
    ]);

    const request = vi.mocked(generateText).mock.calls[0]?.[0];
    expect(request?.prompt).not.toContain("Test User");
    expect(request?.prompt).not.toContain("Bank A personal account");
    expect(request?.prompt).not.toContain("500000");
    expect(request?.prompt).toContain("direction、matchedSignals");
    expect(request?.prompt).toContain('"amountBand": "large"');
    expect(result).toMatchObject({ classification: "salary", confidence: 0.8 });
  });
});
