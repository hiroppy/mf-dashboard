import { describe, expect, it } from "vitest";
import rawAssertFinanceResponse from "./assertions";

const assertFinanceResponse = (
  output: string,
  context?: Parameters<typeof rawAssertFinanceResponse>[1],
) => {
  try {
    const value = JSON.parse(output) as Record<string, unknown>;
    const textEvidence = Array.isArray(value.textEvidence)
      ? value.textEvidence.map((evidence) =>
          typeof evidence === "object" && evidence !== null
            ? { allowedHrefs: [], dataToolResults: [], ...evidence }
            : evidence,
        )
      : [];
    return rawAssertFinanceResponse(
      JSON.stringify({
        allowedHrefs: [],
        dataToolResults: [],
        unauthorizedLinks: [],
        ...value,
        textEvidence,
      }),
      context,
    );
  } catch {
    return rawAssertFinanceResponse(output, context);
  }
};

const output = JSON.stringify({
  allowedHrefs: ["/0/cf/2026-07"],
  dataToolResults: [
    {
      toolName: "getMonthlySummaryByMonth",
      input: { month: "2026-07" },
      output: { month: "2026-07", netIncome: 93341 },
    },
  ],
  text: "2026年7月の収支です。",
  textEvidence: [
    {
      text: "2026年7月の収支です。",
      allowedHrefs: ["/0/cf/2026-07"],
      dataToolResults: [
        {
          toolName: "getMonthlySummaryByMonth",
          input: { month: "2026-07" },
          output: { month: "2026-07", netIncome: 93341 },
        },
      ],
    },
  ],
  unauthorizedLinks: [],
  cards: [
    {
      type: "summary",
      title: "月次収支",
      description: "2026年7月",
      metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
      href: "/0/cf/2026-07",
    },
  ],
});

describe("assertFinanceResponse", () => {
  it("rejects unauthorized links recorded before sanitization", () => {
    const sanitizedOutput = JSON.stringify({
      ...JSON.parse(output),
      text: "",
      textEvidence: [{ text: "", allowedHrefs: [], dataToolResults: [] }],
      unauthorizedLinks: ["https://evil.example"],
    });

    expect(assertFinanceResponse(sanitizedOutput)).toMatchObject({
      pass: false,
      reason: "未承認の生成リンク: https://evil.example",
    });
  });

  it("accepts expected facts, card types, and routes", () => {
    expect(
      assertFinanceResponse(output, {
        config: {
          expectedCardFacts: ["2026年7月"],
          expectedDataToolFacts: [
            {
              toolName: "getMonthlySummaryByMonth",
              input: { month: "2026-07" },
              path: "$.netIncome",
              value: 93341,
            },
          ],
          expectedMetrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          expectedCardTypes: ["summary"],
          expectedRoute: "/0/cf/2026-07",
        },
      }),
    ).toMatchObject({ pass: true, score: 1 });
  });

  it("rejects claims without matching data-tool evidence", () => {
    const fabricatedOutput = JSON.stringify({
      ...JSON.parse(output),
      dataToolResults: [],
    });

    expect(
      assertFinanceResponse(fabricatedOutput, {
        config: {
          expectedDataToolFacts: [
            { toolName: "getMonthlySummaryByMonth", path: "$.netIncome", value: 93341 },
          ],
        },
      }),
    ).toMatchObject({
      pass: false,
      reason: "不足 data tool facts: getMonthlySummaryByMonth:$.netIncome",
    });
  });

  it("requires ordered text evidence when data-tool facts are evaluated", () => {
    const missingTextEvidence = JSON.parse(output);
    delete missingTextEvidence.textEvidence;

    expect(
      assertFinanceResponse(JSON.stringify(missingTextEvidence), {
        config: {
          expectedDataToolFacts: [
            { toolName: "getMonthlySummaryByMonth", path: "$.netIncome", value: 93341 },
          ],
        },
      }),
    ).toMatchObject({
      pass: false,
      reason: expect.stringContaining("textEvidence が欠落または最終テキストと不一致です。"),
    });
  });

  it("fails closed when a security evidence field is missing", () => {
    const missingSecurityEvidence = JSON.parse(output);
    delete missingSecurityEvidence.unauthorizedLinks;

    expect(
      rawAssertFinanceResponse(JSON.stringify(missingSecurityEvidence), {
        config: {
          expectedDataToolFacts: [
            { toolName: "getMonthlySummaryByMonth", path: "$.netIncome", value: 93341 },
          ],
        },
      }),
    ).toMatchObject({
      pass: false,
      reason: expect.stringContaining("評価証跡フィールドが欠落または不正です。"),
    });
  });

  it.each(["allowedHrefs", "unauthorizedLinks"])(
    "fails closed when top-level %s is omitted without configured facts",
    (field) => {
      const missingEvidence = JSON.parse(output);
      delete missingEvidence[field];

      expect(rawAssertFinanceResponse(JSON.stringify(missingEvidence))).toMatchObject({
        pass: false,
        reason: expect.stringContaining("評価証跡フィールドが欠落または不正です。"),
      });
    },
  );

  it.each(["allowedHrefs", "dataToolResults"])(
    "fails closed when textEvidence.%s is omitted",
    (field) => {
      const missingEvidence = JSON.parse(output);
      delete missingEvidence.textEvidence[0][field];

      expect(rawAssertFinanceResponse(JSON.stringify(missingEvidence))).toMatchObject({
        pass: false,
        reason: expect.stringContaining("評価証跡フィールドが欠落または不正です。"),
      });
    },
  );

  it.each([
    ["unauthorizedLinks", (value: Record<string, unknown>) => (value.unauthorizedLinks = [null])],
    ["allowedHrefs", (value: Record<string, unknown>) => (value.allowedHrefs = [null])],
    ["dataToolResults", (value: Record<string, unknown>) => (value.dataToolResults = [null])],
    ["textEvidence", (value: Record<string, unknown>) => (value.textEvidence = [null])],
    [
      "textEvidence.allowedHrefs",
      (value: Record<string, unknown>) =>
        ((value.textEvidence as Array<Record<string, unknown>>)[0].allowedHrefs = [null]),
    ],
    [
      "textEvidence.dataToolResults",
      (value: Record<string, unknown>) =>
        ((value.textEvidence as Array<Record<string, unknown>>)[0].dataToolResults = [null]),
    ],
  ])("fails closed when %s contains a malformed element", (_field, mutate) => {
    const malformedEvidence = JSON.parse(output) as Record<string, unknown>;
    mutate(malformedEvidence);

    expect(
      assertFinanceResponse(JSON.stringify(malformedEvidence), {
        config: {
          expectedDataToolFacts: [
            {
              toolName: "getMonthlySummaryByMonth",
              input: { month: "2026-07" },
              path: "$.netIncome",
              value: 93341,
            },
          ],
        },
      }),
    ).toMatchObject({
      pass: false,
      reason: expect.stringContaining("評価証跡フィールドが欠落または不正です。"),
    });
  });

  it("matches data-tool evidence by tool, input, path, and exact value", () => {
    const wrongEvidenceOutput = JSON.stringify({
      ...JSON.parse(output),
      dataToolResults: [
        {
          toolName: "getUnrelatedTool",
          input: { month: "2026-06" },
          output: { previousMonth: { unrelated: 93341 }, amount: 1297 },
        },
      ],
    });

    expect(
      assertFinanceResponse(wrongEvidenceOutput, {
        config: {
          expectedDataToolFacts: [
            {
              toolName: "getMonthlySummaryByMonth",
              input: { month: "2026-07" },
              path: "$.netIncome",
              value: 93341,
            },
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("accepts a latest monthly summary for a matching by-month expectation", () => {
    const latestResult = {
      toolName: "getLatestMonthlySummary",
      input: {},
      output: { month: "2026-07", netIncome: 93341 },
    };
    const latestOutput = JSON.stringify({
      ...JSON.parse(output),
      dataToolResults: [latestResult],
      textEvidence: [
        {
          text: "2026年7月の収支です。",
          allowedHrefs: ["/0/cf/2026-07"],
          dataToolResults: [latestResult],
        },
      ],
    });

    expect(
      assertFinanceResponse(latestOutput, {
        config: {
          expectedDataToolFacts: [
            {
              toolName: "getMonthlySummaryByMonth",
              input: { month: "2026-07" },
              path: "$.netIncome",
              value: 93341,
            },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("rejects transaction evidence retrieved with an unbounded input", () => {
    const transaction = {
      date: "2026-07-10",
      description: "Test Store",
      category: "食費",
      type: "expense",
    };
    const unboundedResult = {
      toolName: "searchTransactions",
      input: {},
      output: { transactions: [transaction] },
    };
    const unboundedOutput = JSON.stringify({
      ...JSON.parse(output),
      dataToolResults: [unboundedResult],
      text: "対象日の明細です。",
      textEvidence: [{ text: "対象日の明細です。", dataToolResults: [unboundedResult] }],
    });

    expect(
      assertFinanceResponse(unboundedOutput, {
        config: {
          expectedDataToolFacts: [
            {
              toolName: "searchTransactions",
              input: { date: "2026-07-10", type: "expense" },
              path: "$.transactions.*",
              value: transaction,
            },
          ],
        },
      }),
    ).toMatchObject({
      pass: false,
      reason: expect.stringContaining("不足 data tool facts: searchTransactions"),
    });
  });

  it("rejects a visible amount stated before its supporting tool result", () => {
    const earlyClaimOutput = JSON.stringify({
      ...JSON.parse(output),
      text: "収支は93,341円です。",
      textEvidence: [{ text: "収支は93,341円です。", dataToolResults: [] }],
    });

    expect(
      assertFinanceResponse(earlyClaimOutput, {
        config: {
          allowedVisibleAmounts: [93341],
          visibleAmountClaims: [{ label: "収支", amount: 93341 }],
          expectedDataToolFacts: [
            {
              toolName: "getMonthlySummaryByMonth",
              input: { month: "2026-07" },
              path: "$.netIncome",
              value: 93341,
            },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: "取得前に主張された可視数値: 金額=93341" });
  });

  it("rejects a visible percentage stated before its source tool result", () => {
    const earlyClaimOutput = JSON.stringify({
      ...JSON.parse(output),
      text: "貯蓄率は29.8%です。",
      textEvidence: [{ text: "貯蓄率は29.8%です。", dataToolResults: [] }],
    });

    expect(
      assertFinanceResponse(earlyClaimOutput, {
        config: {
          allowedVisiblePercentages: [29.8],
          visiblePercentageClaims: [{ label: "貯蓄率", amount: 29.8 }],
          expectedDataToolFacts: [
            {
              toolName: "getMonthlySummaryByMonth",
              input: { month: "2026-07" },
              path: "$.netIncome",
              value: 93341,
            },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: "取得前に主張された可視数値: 割合=29.8" });
  });

  it("rejects a derived percentage without configured source evidence", () => {
    const incomeResult = {
      toolName: "getMonthlySummaryByMonth",
      input: { month: "2026-07" },
      output: { totalIncome: 313235 },
    };
    const expenseResult = {
      toolName: "getMonthlySummaryByMonth",
      input: { month: "2026-07" },
      output: { totalExpense: 219894 },
    };
    const unsupportedRateOutput = JSON.stringify({
      ...JSON.parse(output),
      dataToolResults: [incomeResult, expenseResult],
      text: "先月の貯蓄率は64.48%です。",
      textEvidence: [
        {
          text: "先月の貯蓄率は64.48%です。",
          dataToolResults: [incomeResult, expenseResult],
        },
      ],
    });

    expect(
      assertFinanceResponse(unsupportedRateOutput, {
        config: {
          allowedVisiblePercentages: [64.48],
          visiblePercentageClaims: [
            { label: "貯蓄率", amount: 64.48, rolePattern: "(前月|先月|比較)" },
          ],
          expectedDataToolFacts: [
            {
              toolName: "getMonthlySummaryByMonth",
              input: { month: "2026-07" },
              path: "$.totalIncome",
              value: 313235,
            },
            {
              toolName: "getMonthlySummaryByMonth",
              input: { month: "2026-07" },
              path: "$.totalExpense",
              value: 219894,
            },
          ],
        },
      }),
    ).toMatchObject({
      pass: false,
      reason: expect.stringContaining("取得前に主張された可視数値: 割合=64.48"),
    });
  });

  it("rejects a visible route stated before its navigation tool result", () => {
    const earlyRouteOutput = JSON.stringify({
      ...JSON.parse(output),
      text: "[詳細][route]\n\n[route]: /0/cf/2026-07",
      textEvidence: [
        {
          text: "[詳細][route]\n\n[route]: /0/cf/2026-07",
          allowedHrefs: [],
          dataToolResults: [],
        },
      ],
    });

    expect(
      assertFinanceResponse(earlyRouteOutput, {
        config: { expectedRoute: "/0/cf/2026-07" },
      }),
    ).toMatchObject({
      pass: false,
      reason: "取得前に表示されたroute: /0/cf/2026-07",
    });
  });

  it("rejects a derived delta stated before all source tool results", () => {
    const dataToolResults = [
      {
        toolName: "getMonthlyCategoryTotals",
        input: { month: "2026-07" },
        output: [{ category: "衣服・美容", type: "expense", totalAmount: 19475 }],
      },
      {
        toolName: "getMonthlyCategoryTotals",
        input: { month: "2026-06" },
        output: [{ category: "衣服・美容", type: "expense", totalAmount: 12111 }],
      },
    ];
    const earlyClaimOutput = JSON.stringify({
      ...JSON.parse(output),
      dataToolResults,
      text: "衣服・美容は前月より7,364円増加です。",
      textEvidence: [{ text: "衣服・美容は前月より7,364円増加です。", dataToolResults: [] }],
    });

    expect(
      assertFinanceResponse(earlyClaimOutput, {
        config: {
          allowedVisibleAmounts: [7364],
          visibleAmountClaims: [{ label: "衣服・美容", amount: 7364, rolePattern: "(前月|増加)" }],
          expectedDataToolFacts: [
            {
              toolName: "getMonthlyCategoryTotals",
              input: { month: "2026-07" },
              path: "$.*",
              value: { category: "衣服・美容", totalAmount: 19475 },
            },
            {
              toolName: "getMonthlyCategoryTotals",
              input: { month: "2026-06" },
              path: "$.*",
              value: { category: "衣服・美容", totalAmount: 12111 },
            },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: "取得前に主張された可視数値: 金額=7364" });
  });

  it("allows direct values as each supporting tool fact becomes available", () => {
    const incomeResult = {
      toolName: "getMonthlySummaryByMonth",
      input: { month: "2026-07" },
      output: { totalIncome: 313235 },
    };
    const expenseResult = {
      toolName: "getMonthlySummaryByMonth",
      input: { month: "2026-07" },
      output: { totalExpense: 219894 },
    };
    const stagedOutput = JSON.stringify({
      ...JSON.parse(output),
      dataToolResults: [incomeResult, expenseResult],
      text: "収入は313,235円です。支出は219,894円です。",
      textEvidence: [
        { text: "収入は313,235円です。", dataToolResults: [incomeResult] },
        { text: "支出は219,894円です。", dataToolResults: [incomeResult, expenseResult] },
      ],
    });

    expect(
      assertFinanceResponse(stagedOutput, {
        config: {
          allowedVisibleAmounts: [313235, 219894],
          visibleAmountClaims: [
            { label: "収入", amount: 313235 },
            { label: "支出", amount: 219894 },
          ],
          expectedDataToolFacts: [
            {
              toolName: "getMonthlySummaryByMonth",
              input: { month: "2026-07" },
              path: "$.totalIncome",
              value: 313235,
            },
            {
              toolName: "getMonthlySummaryByMonth",
              input: { month: "2026-07" },
              path: "$.totalExpense",
              value: 219894,
            },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("grounds a derived transaction total from preceding row amounts", () => {
    const searchResult = {
      toolName: "searchTransactions",
      input: { date: "2026-07-10", type: "expense" },
      output: {
        transactions: [
          { description: "Test Utility", amount: 3435, type: "expense" },
          { description: "Test Store", amount: 3152, type: "expense" },
        ],
      },
    };
    const totalOutput = JSON.stringify({
      ...JSON.parse(output),
      dataToolResults: [searchResult],
      text: "7月10日の支出は6,587円です。",
      textEvidence: [{ text: "7月10日の支出は6,587円です。", dataToolResults: [searchResult] }],
    });

    expect(
      assertFinanceResponse(totalOutput, {
        config: {
          allowedVisibleAmounts: [6587],
          derivedVisibleClaims: [{ amount: 6587, sourceValues: [3435, 3152] }],
          expectedDataToolFacts: [
            {
              toolName: "searchTransactions",
              input: { date: "2026-07-10", type: "expense" },
              path: "$.transactions.*",
              value: { description: "Test Utility", amount: 3435, type: "expense" },
            },
            {
              toolName: "searchTransactions",
              input: { date: "2026-07-10", type: "expense" },
              path: "$.transactions.*",
              value: { description: "Test Store", amount: 3152, type: "expense" },
            },
          ],
          visibleAmountClaims: [{ label: "支出", amount: 6587 }],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("does not ground an income claim with an unrelated same-number fact", () => {
    const incomeResult = {
      toolName: "getMonthlySummaryByMonth",
      input: { month: "2026-07" },
      output: { totalIncome: 313235 },
    };
    const categoryResult = {
      toolName: "getMonthlyCategoryTotals",
      input: { month: "2026-07" },
      output: [{ category: "その他", type: "expense", totalAmount: 313235 }],
    };
    const earlyClaimOutput = JSON.stringify({
      ...JSON.parse(output),
      dataToolResults: [incomeResult, categoryResult],
      text: "収入は313,235円です。",
      textEvidence: [{ text: "収入は313,235円です。", dataToolResults: [categoryResult] }],
    });

    expect(
      assertFinanceResponse(earlyClaimOutput, {
        config: {
          allowedVisibleAmounts: [313235],
          visibleAmountClaims: [{ label: "収入", amount: 313235 }],
          expectedDataToolFacts: [
            {
              toolName: "getMonthlySummaryByMonth",
              input: { month: "2026-07" },
              path: "$.totalIncome",
              value: 313235,
            },
            {
              toolName: "getMonthlyCategoryTotals",
              input: { month: "2026-07" },
              path: "$.*",
              value: { category: "その他", totalAmount: 313235 },
            },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: "取得前に主張された可視数値: 金額=313235" });
  });

  it("does not fall back to an unrelated same-number fact for a labeled claim", () => {
    const categoryResult = {
      toolName: "getMonthlyCategoryTotals",
      input: { month: "2026-07" },
      output: [{ category: "その他", type: "expense", totalAmount: 313235 }],
    };
    const wrongEvidenceOutput = JSON.stringify({
      ...JSON.parse(output),
      dataToolResults: [categoryResult],
      text: "収入は313,235円です。",
      textEvidence: [{ text: "収入は313,235円です。", dataToolResults: [categoryResult] }],
    });

    expect(
      assertFinanceResponse(wrongEvidenceOutput, {
        config: {
          allowedVisibleAmounts: [313235],
          visibleAmountClaims: [{ label: "収入", amount: 313235 }],
          expectedDataToolFacts: [
            {
              toolName: "getMonthlyCategoryTotals",
              input: { month: "2026-07" },
              path: "$.*",
              value: { category: "その他", totalAmount: 313235 },
            },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: "取得前に主張された可視数値: 金額=313235" });
  });

  it("does not ground a monthly claim with an identical value from another month", () => {
    const juneResult = {
      toolName: "getMonthlySummaryByMonth",
      input: { month: "2026-06" },
      output: { totalIncome: 100 },
    };
    const julyResult = {
      toolName: "getMonthlySummaryByMonth",
      input: { month: "2026-07" },
      output: { totalIncome: 100 },
    };
    const wrongPeriodOutput = JSON.stringify({
      ...JSON.parse(output),
      dataToolResults: [juneResult, julyResult],
      text: "2026年7月の収入は100円です。",
      textEvidence: [{ text: "2026年7月の収入は100円です。", dataToolResults: [juneResult] }],
    });

    expect(
      assertFinanceResponse(wrongPeriodOutput, {
        config: {
          allowedVisibleAmounts: [100],
          allowedVisibleMonths: ["2026-07"],
          expectedDataToolFacts: [
            {
              toolName: "getMonthlySummaryByMonth",
              input: { month: "2026-06" },
              path: "$.totalIncome",
              value: 100,
            },
            {
              toolName: "getMonthlySummaryByMonth",
              input: { month: "2026-07" },
              path: "$.totalIncome",
              value: 100,
            },
          ],
          visibleAmountClaims: [{ label: "収入", amount: 100 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: "取得前に主張された可視数値: 金額=100" });
  });

  it("grounds each amount with its nearby month in a multi-month comparison", () => {
    const juneResult = {
      toolName: "getMonthlyCategoryTotals",
      input: { month: "2026-06" },
      output: [{ category: "食費", type: "expense", totalAmount: 49922 }],
    };
    const julyResult = {
      toolName: "getMonthlyCategoryTotals",
      input: { month: "2026-07" },
      output: [{ category: "食費", type: "expense", totalAmount: 41837 }],
    };
    const comparisonOutput = JSON.stringify({
      ...JSON.parse(output),
      dataToolResults: [juneResult, julyResult],
      text: "2026年6月の食費は49,922円、2026年7月は41,837円です。",
      textEvidence: [
        {
          text: "2026年6月の食費は49,922円、2026年7月は41,837円です。",
          dataToolResults: [juneResult, julyResult],
        },
      ],
    });

    expect(
      assertFinanceResponse(comparisonOutput, {
        config: {
          allowedVisibleAmounts: [49922, 41837],
          allowedVisibleMonths: ["2026-06", "2026-07"],
          expectedDataToolFacts: [
            {
              toolName: "getMonthlyCategoryTotals",
              input: { month: "2026-06" },
              path: "$.*",
              value: { category: "食費", totalAmount: 49922 },
            },
            {
              toolName: "getMonthlyCategoryTotals",
              input: { month: "2026-07" },
              path: "$.*",
              value: { category: "食費", totalAmount: 41837 },
            },
          ],
          visibleAmountClaims: [
            { label: "食費", amount: 49922 },
            { label: "食費", amount: 41837 },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("uses the visible label to distinguish equal income and expense facts", () => {
    const incomeResult = {
      toolName: "getMonthlySummaryByMonth",
      input: { month: "2026-07" },
      output: { totalIncome: 100 },
    };
    const expenseResult = {
      toolName: "getMonthlySummaryByMonth",
      input: { month: "2026-07" },
      output: { totalExpense: 100 },
    };
    const wrongLabelEvidenceOutput = JSON.stringify({
      ...JSON.parse(output),
      dataToolResults: [incomeResult, expenseResult],
      text: "収入は100円です。",
      textEvidence: [{ text: "収入は100円です。", dataToolResults: [expenseResult] }],
    });

    expect(
      assertFinanceResponse(wrongLabelEvidenceOutput, {
        config: {
          allowedVisibleAmounts: [100],
          visibleAmountClaims: [
            { label: "収入", amount: 100 },
            { label: "支出", amount: 100 },
          ],
          expectedDataToolFacts: [
            {
              toolName: "getMonthlySummaryByMonth",
              input: { month: "2026-07" },
              path: "$.totalIncome",
              value: 100,
            },
            {
              toolName: "getMonthlySummaryByMonth",
              input: { month: "2026-07" },
              path: "$.totalExpense",
              value: 100,
            },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: "取得前に主張された可視数値: 金額=100" });
  });

  it("requires identity fields and values on the same data-tool row", () => {
    const splitEvidenceOutput = JSON.stringify({
      ...JSON.parse(output),
      dataToolResults: [
        {
          toolName: "getMonthlyCategoryTotals",
          input: { month: "2026-07" },
          output: [
            { category: "食費", type: "expense", totalAmount: 999 },
            { category: "日用品", type: "expense", totalAmount: 41837 },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(splitEvidenceOutput, {
        config: {
          expectedDataToolFacts: [
            {
              toolName: "getMonthlyCategoryTotals",
              input: { month: "2026-07" },
              path: "$.*",
              value: { category: "食費", type: "expense", totalAmount: 41837 },
            },
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("requires source evidence for every allowlisted improvement category", () => {
    const clothingOnlyOutput = JSON.stringify({
      ...JSON.parse(output),
      dataToolResults: [
        {
          toolName: "getMonthlyCategoryTotals",
          input: { month: "2026-07" },
          output: [{ category: "衣服・美容", type: "expense", totalAmount: 19475 }],
        },
      ],
    });

    expect(
      assertFinanceResponse(clothingOnlyOutput, {
        config: {
          expectedDataToolFacts: [
            {
              toolName: "getMonthlyCategoryTotals",
              input: { month: "2026-07" },
              path: "$.*",
              value: { category: "衣服・美容", type: "expense", totalAmount: 19475 },
            },
            {
              toolName: "getMonthlyCategoryTotals",
              input: { month: "2026-07" },
              path: "$.*",
              value: { category: "食費", type: "expense", totalAmount: 41837 },
            },
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects malformed evaluation output", () => {
    expect(assertFinanceResponse("not-json")).toMatchObject({
      pass: false,
      reason: "text/cards の評価 JSON が不正です。",
    });
  });

  it("rejects an undeclared monetary claim in visible text", () => {
    const fabricatedAmountOutput = JSON.stringify({
      text: "支出は999,999円です。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          description: "支出は¥999999です。",
          metrics: [{ label: "支出", amount: 219894, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(fabricatedAmountOutput, {
        config: {
          allowedVisibleAmounts: [219894],
          expectedMetrics: [{ label: "支出", amount: 219894, amountType: "expense" }],
        },
      }),
    ).toMatchObject({ pass: false, reason: "未許可の可視金額: 999999" });
  });

  it("rejects an allowlisted amount assigned to the wrong metric label", () => {
    const mislabeledAmountOutput = JSON.stringify({
      text: "支出は313,235円です。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [
            { label: "収入", amount: 313235, amountType: "income" },
            { label: "支出", amount: 219894, amountType: "expense" },
          ],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(mislabeledAmountOutput, {
        config: {
          allowedVisibleAmounts: [313235, 219894],
          visibleAmountClaims: [
            { label: "収入", amount: 313235 },
            { label: "支出", amount: 219894 },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: "誤ラベルの可視金額: 支出=313235" });
  });

  it("rejects an allowlisted amount with an unknown label", () => {
    const unknownLabelOutput = JSON.stringify({
      text: "生活費は313,235円です。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収入", amount: 313235, amountType: "income" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(unknownLabelOutput, {
        config: {
          allowedVisibleAmounts: [313235],
          visibleAmountClaims: [{ label: "収入", amount: 313235 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: "誤ラベルの可視金額: 不明=313235" });
  });

  it("rejects a bare unsupported number in a monetary context", () => {
    const bareAmountOutput = JSON.stringify({
      text: "収支は999999です。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    const result = assertFinanceResponse(bareAmountOutput, {
      config: {
        allowedVisibleAmounts: [93341],
        visibleAmountClaims: [{ label: "収支", amount: 93341 }],
      },
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("未許可の可視金額: 999999");
  });

  it("rejects a bare amount followed by a nonmonetary unit", () => {
    const shareCountOutput = JSON.stringify({
      text: "総資産は5,683,100株です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(shareCountOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({
      pass: false,
      reason: expect.stringContaining("非金銭単位付き可視金額: 5683100株です"),
    });
  });

  it("rejects a bare unsupported amount stated before its finance label", () => {
    const bareAmountOutput = JSON.stringify({
      text: "999999が今月の収入です。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収入", amount: 313235, amountType: "income" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    const result = assertFinanceResponse(bareAmountOutput, {
      config: {
        allowedVisibleAmounts: [313235],
        visibleAmountClaims: [{ label: "収入", amount: 313235 }],
      },
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toContain("未許可の可視金額: 999999");
  });

  it("does not treat a month duration as a bare monetary claim", () => {
    const durationOutput = JSON.stringify({
      text: "総資産を3か月ごとに確認しましょう。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(durationOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("rejects a bare unsupported amount with an unconfigured finance label", () => {
    const bareAmountOutput = JSON.stringify({
      text: "生活費は999999です。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(bareAmountOutput, {
        config: {
          allowedVisibleAmounts: [93341],
          visibleAmountClaims: [{ label: "収支", amount: 93341 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a reversed income-expense comparison", () => {
    const reversedOutput = JSON.stringify({
      text: "支出が収入を上回っています。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [
            { label: "収入", amount: 313235, amountType: "income" },
            { label: "支出", amount: 219894, amountType: "expense" },
          ],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(reversedOutput, {
        config: {
          forbiddenVisiblePatterns: [
            "((支出|出費).{0,12}(収入|所得).{0,12}(上回(?!っていません|っていない|らない)|超え(?!ていません|ていない|ない)|多い(?!わけではありません|わけではない|とは限りません|とは限らない))|(収入|所得).{0,12}(支出|出費).{0,12}(下回(?!っていません|っていない|らない)|少ない(?!わけではありません|わけではない|とは限りません|とは限らない)))",
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("accepts an explicitly negated reversed income-expense comparison", () => {
    const comparisonOutput = JSON.stringify({
      text: "支出は収入を上回っていません。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [
            { label: "収入", amount: 313235, amountType: "income" },
            { label: "支出", amount: 219894, amountType: "expense" },
          ],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(comparisonOutput, {
        config: {
          forbiddenVisiblePatterns: [
            "((支出|出費).{0,12}(収入|所得).{0,12}(上回(?!っていません|っていない|らない)|超え(?!ていません|ていない|ない)|多い(?!わけではありません|わけではない|とは限りません|とは限らない))|(収入|所得).{0,12}(支出|出費).{0,12}(下回(?!っていません|っていない|らない)|少ない(?!わけではありません|わけではない|とは限りません|とは限らない)))",
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it.each([
    [
      "収入と支出は同額です。",
      "((収入|所得).{0,12}(支出|出費)|(支出|出費).{0,12}(収入|所得)).{0,12}(同額|同じ(?:くらい|程度)?|等しい|ほぼ同額|ほぼ同じ|大差(?:が)?ない|差(?:が)?ない)",
    ],
    [
      "今月は貯蓄できていません。",
      "(貯蓄|積立).{0,12}(できていません|できていない|できません|できない|していません|していない|ありません|ない|なし|ゼロ)",
    ],
    [
      "支出は予算内です。",
      "((支出|出費).{0,12}予算.{0,8}(内|範囲内|以下|超過|オーバー|上回|下回)(?![^。！？\\n]{0,16}(判断でき|わかり|分かり|不明|とは限|とは言え))|予算.{0,12}(内|範囲内|以下|超過|オーバー|上回|下回)(?![^。！？\\n]{0,16}(判断でき|わかり|分かり|不明|とは限|とは言え)).{0,8}(支出|出費))",
    ],
  ])("rejects an unsupported monthly qualitative claim: %s", (text, pattern) => {
    const qualitativeOutput = JSON.stringify({
      text,
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [
            { label: "収入", amount: 313235, amountType: "income" },
            { label: "支出", amount: 219894, amountType: "expense" },
          ],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(qualitativeOutput, {
        config: { forbiddenVisiblePatterns: [pattern] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("禁止された可視表現") });
  });

  it("accepts explicit uncertainty about budget status", () => {
    const uncertainOutput = JSON.stringify({
      text: "支出が予算内かは判断できません。",
      cards: JSON.parse(output).cards,
    });

    expect(
      assertFinanceResponse(uncertainOutput, {
        config: {
          forbiddenVisiblePatterns: [
            "((支出|出費).{0,12}予算.{0,8}(内|範囲内|以下|超過|オーバー|上回|下回)(?![^。！？\\n]{0,16}(判断でき|わかり|分かり|不明|とは限|とは言え))|予算.{0,12}(内|範囲内|以下|超過|オーバー|上回|下回)(?![^。！？\\n]{0,16}(判断でき|わかり|分かり|不明|とは限|とは言え)).{0,8}(支出|出費))",
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it.each([
    ["収入はすべて給与です。", false],
    ["収入がすべて給与とは限りません。", true],
  ])("validates an aggregate income-source composition claim: %s", (text, pass) => {
    const compositionOutput = JSON.stringify({ text, cards: JSON.parse(output).cards });

    expect(
      assertFinanceResponse(compositionOutput, {
        config: {
          forbiddenVisiblePatterns: [
            "((収入|所得).{0,20}(すべて|全て|全部|全額|のみ|だけ).{0,8}(給与|給料|賞与|ボーナス|事業収入|副業|利息|ポイント)(?![^。！？\\n]{0,16}(とは限|とは言え|断定でき|判断でき|不明))|(給与|給料|賞与|ボーナス|事業収入|副業|利息|ポイント).{0,12}(が|で)(収入|所得).{0,8}(すべて|全て|全部|全額|を構成|を占め))",
          ],
        },
      }),
    ).toMatchObject({ pass });
  });

  it.each([
    ["支出はすべて住宅費です。", false],
    ["支出がすべて住宅費とは限りません。", true],
  ])("validates an aggregate expense-category composition claim: %s", (text, pass) => {
    const compositionOutput = JSON.stringify({ text, cards: JSON.parse(output).cards });

    expect(
      assertFinanceResponse(compositionOutput, {
        config: {
          forbiddenVisiblePatterns: [
            "((支出|出費).{0,20}(すべて|全て|全部|全額|のみ|だけ).{0,8}(住宅費|食費|日用品|水道・光熱費|交通費|通信費|医療費|教育費|娯楽費)(?![^。！？\\n]{0,16}(とは限|とは言え|断定でき|判断でき|不明))|(住宅費|食費|日用品|水道・光熱費|交通費|通信費|医療費|教育費|娯楽費).{0,12}(が|で)(支出|出費).{0,8}(すべて|全て|全部|全額|を構成|を占め))",
          ],
        },
      }),
    ).toMatchObject({ pass });
  });

  it.each([
    ["食費は住宅費より多いです。", false],
    ["食費は住宅費より少ないです。", true],
    ["食費は住宅費以上です。", false],
    ["住宅費以下なのは食費です。", true],
    ["住宅費より食費が多いとは限りません。", true],
    ["食費は収入カテゴリです。", false],
    ["食費は収入に分類されます。", false],
    ["食費は入金カテゴリです。", false],
    ["食費は支出カテゴリです。", true],
    ["食費は出金に分類されます。", true],
  ])("validates a grounded qualitative category claim: %s", (text, pass) => {
    const categoryResult = {
      toolName: "getMonthlyCategoryTotals",
      input: { month: "2026-07" },
      output: [
        { category: "食費", type: "expense", totalAmount: 41837 },
        { category: "住宅費", type: "expense", totalAmount: 75000 },
      ],
    };
    const comparisonOutput = JSON.stringify({
      ...JSON.parse(output),
      text,
      dataToolResults: [categoryResult],
      textEvidence: [{ text, dataToolResults: [categoryResult] }],
    });

    expect(assertFinanceResponse(comparisonOutput)).toMatchObject({ pass });
  });

  it("rejects a category comparison asserted before its retrieval evidence", () => {
    const categoryResult = {
      toolName: "getMonthlyCategoryTotals",
      input: { month: "2026-07" },
      output: [
        { category: "食費", type: "expense", totalAmount: 41837 },
        { category: "住宅費", type: "expense", totalAmount: 75000 },
      ],
    };
    const text = "食費は住宅費より少ないです。";
    const earlyComparisonOutput = JSON.stringify({
      ...JSON.parse(output),
      text,
      dataToolResults: [categoryResult],
      textEvidence: [{ text, dataToolResults: [] }],
    });

    expect(assertFinanceResponse(earlyComparisonOutput)).toMatchObject({
      pass: false,
      reason: expect.stringContaining("誤ったカテゴリ間比較"),
    });
  });

  it("scopes a category comparison to its stated month", () => {
    const juneResult = {
      toolName: "getMonthlyCategoryTotals",
      input: { month: "2026-06" },
      output: [
        { category: "健康・医療", type: "expense", totalAmount: 30000 },
        { category: "衣服・美容", type: "expense", totalAmount: 12000 },
      ],
    };
    const julyResult = {
      toolName: "getMonthlyCategoryTotals",
      input: { month: "2026-07" },
      output: [
        { category: "健康・医療", type: "expense", totalAmount: 8000 },
        { category: "衣服・美容", type: "expense", totalAmount: 19000 },
      ],
    };
    const text = "2026年7月は健康・医療が衣服・美容より多いです。";
    const multiMonthOutput = JSON.stringify({
      ...JSON.parse(output),
      text,
      dataToolResults: [juneResult, julyResult],
      textEvidence: [{ text, allowedHrefs: [], dataToolResults: [juneResult, julyResult] }],
    });

    expect(assertFinanceResponse(multiMonthOutput)).toMatchObject({
      pass: false,
      reason: expect.stringContaining("誤ったカテゴリ間比較"),
    });
  });

  it("scopes each category comparison to its own clause", () => {
    const juneResult = {
      toolName: "getMonthlyCategoryTotals",
      input: { month: "2026-06" },
      output: [
        { category: "健康・医療", type: "expense", totalAmount: 30000 },
        { category: "衣服・美容", type: "expense", totalAmount: 12000 },
      ],
    };
    const julyResult = {
      toolName: "getMonthlyCategoryTotals",
      input: { month: "2026-07" },
      output: [
        { category: "健康・医療", type: "expense", totalAmount: 8000 },
        { category: "衣服・美容", type: "expense", totalAmount: 19000 },
      ],
    };
    const text =
      "2026年6月は健康・医療が衣服・美容より多いです。2026年7月は健康・医療が衣服・美容より多いです。";
    const comparisonOutput = JSON.stringify({
      ...JSON.parse(output),
      text,
      dataToolResults: [juneResult, julyResult],
      textEvidence: [{ text, allowedHrefs: [], dataToolResults: [juneResult, julyResult] }],
    });

    expect(assertFinanceResponse(comparisonOutput)).toMatchObject({
      pass: false,
      reason: expect.stringContaining("誤ったカテゴリ間比較"),
    });
  });

  it("recognizes a のほうが category comparison", () => {
    const categoryResult = {
      toolName: "getMonthlyCategoryTotals",
      input: { month: "2026-07" },
      output: [
        { category: "食費", type: "expense", totalAmount: 41837 },
        { category: "住宅費", type: "expense", totalAmount: 75000 },
      ],
    };
    const text = "食費のほうが住宅費より多いです。";
    const comparisonOutput = JSON.stringify({
      ...JSON.parse(output),
      text,
      dataToolResults: [categoryResult],
      textEvidence: [{ text, allowedHrefs: [], dataToolResults: [categoryResult] }],
    });

    expect(assertFinanceResponse(comparisonOutput)).toMatchObject({
      pass: false,
      reason: expect.stringContaining("誤ったカテゴリ間比較"),
    });
  });

  it.each(["収入と支出は同額ではありません。", "収入と支出は同じくらいではありません。"])(
    "accepts an explicitly negated income-expense equality claim: %s",
    (text) => {
      const comparisonOutput = JSON.stringify({
        text,
        cards: [
          {
            type: "summary",
            title: "月次収支",
            metrics: [
              { label: "収入", amount: 313235, amountType: "income" },
              { label: "支出", amount: 219894, amountType: "expense" },
            ],
            href: "/0/cf/2026-07",
          },
        ],
      });

      expect(
        assertFinanceResponse(comparisonOutput, {
          config: {
            forbiddenVisiblePatterns: [
              "((収入|所得).{0,12}(支出|出費)|(支出|出費).{0,12}(収入|所得)).{0,12}(同額(?!\\s*(?:では|じゃ)(?:ありません|ない|なく))|同じ(?!(?:くらい|程度)?\\s*(?:では|じゃ)(?:ありません|ない|なく))(?:くらい|程度)?|等しい(?!\\s*(?:とは|わけでは)?(?:ありません|ない))|ほぼ同額(?!\\s*(?:では|じゃ)(?:ありません|ない))|ほぼ同じ(?!\\s*(?:では|じゃ)(?:ありません|ない))|大差(?:が)?ない|差(?:が)?ない)",
            ],
          },
        }),
      ).toMatchObject({ pass: true });
    },
  );

  it("does not classify a nonmonetary three-letter acronym as a currency", () => {
    const acronymOutput = JSON.stringify({
      text: "ETFの3銘柄に分散します。",
      cards: JSON.parse(output).cards,
    });

    expect(assertFinanceResponse(acronymOutput)).toMatchObject({ pass: true });
  });

  it.each(["給与", "手取り"])(
    "rejects a unitless unsupported amount after the %s income synonym",
    (label) => {
      const salaryOutput = JSON.stringify({
        text: `${label}は999999です。`,
        cards: [
          {
            type: "summary",
            title: "月次収支",
            metrics: [{ label: "収入", amount: 313235, amountType: "income" }],
            href: "/0/cf/2026-07",
          },
        ],
      });

      expect(
        assertFinanceResponse(salaryOutput, {
          config: {
            allowedVisibleAmounts: [313235],
            visibleAmountClaims: [{ label: "収入", amount: 313235 }],
          },
        }),
      ).toMatchObject({ pass: false });
    },
  );

  it("rejects a foreign-currency amount even when its number is allowlisted", () => {
    const foreignCurrencyOutput = JSON.stringify({
      text: "総資産は$5,683,100です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(foreignCurrencyOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it.each(["米ドルで", "USD建てで", "ユーロ換算で"])(
    "rejects a foreign-currency name before an allowlisted amount: %s",
    (currency) => {
      const foreignCurrencyOutput = JSON.stringify({
        text: `総資産は${currency}5,683,100です。`,
        cards: [
          {
            type: "summary",
            title: "総資産",
            metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
            href: "/0/bs",
          },
        ],
      });

      expect(
        assertFinanceResponse(foreignCurrencyOutput, {
          config: {
            allowedVisibleAmounts: [5683100],
            visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
          },
        }),
      ).toMatchObject({ pass: false, reason: expect.stringContaining("外貨建ての可視金額") });
    },
  );

  it.each(["CNY建てで", "人民元で", "ウォン換算で"])(
    "rejects another foreign-currency identifier before an amount: %s",
    (currency) => {
      const foreignCurrencyOutput = JSON.stringify({
        text: `総資産は${currency}5,683,100です。`,
        cards: [
          {
            type: "summary",
            title: "総資産",
            metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
            href: "/0/bs",
          },
        ],
      });

      expect(
        assertFinanceResponse(foreignCurrencyOutput, {
          config: {
            allowedVisibleAmounts: [5683100],
            visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
          },
        }),
      ).toMatchObject({ pass: false, reason: expect.stringContaining("外貨建ての可視金額") });
    },
  );

  it.each(["USD換算で約", "USD建てで、約", "ＵＳＤ建てで"])(
    "rejects a normalized or qualified foreign-currency prefix: %s",
    (currency) => {
      const foreignCurrencyOutput = JSON.stringify({
        text: `総資産は${currency}5,683,100円です。`,
        cards: [
          {
            type: "summary",
            title: "総資産",
            metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
            href: "/0/bs",
          },
        ],
      });

      expect(
        assertFinanceResponse(foreignCurrencyOutput, {
          config: {
            allowedVisibleAmounts: [5683100],
            visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
          },
        }),
      ).toMatchObject({ pass: false, reason: expect.stringContaining("外貨建ての可視金額") });
    },
  );

  it.each(["スイスフラン", "タイバーツ", "インドルピー"])(
    "rejects another named foreign currency after an amount: %s",
    (currency) => {
      const foreignCurrencyOutput = JSON.stringify({
        text: `総資産は5,683,100${currency}です。`,
        cards: [
          {
            type: "summary",
            title: "総資産",
            metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
            href: "/0/bs",
          },
        ],
      });

      expect(
        assertFinanceResponse(foreignCurrencyOutput, {
          config: {
            allowedVisibleAmounts: [5683100],
            visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
          },
        }),
      ).toMatchObject({ pass: false, reason: expect.stringContaining(currency) });
    },
  );

  it.each(["支出の大半は食費です。", "食費が支出の過半数です。"])(
    "rejects an unsupported qualitative spending-composition claim: %s",
    (text) => {
      const qualitativeOutput = JSON.stringify({
        text,
        cards: [
          {
            type: "summary",
            title: "月次収支",
            metrics: [{ label: "支出", amount: 219894, amountType: "expense" }],
            href: "/0/cf/2026-07",
          },
        ],
      });

      expect(
        assertFinanceResponse(qualitativeOutput, {
          config: {
            allowedVisibleAmounts: [219894],
            visibleAmountClaims: [{ label: "支出", amount: 219894 }],
          },
        }),
      ).toMatchObject({
        pass: false,
        reason: expect.stringContaining("未根拠の定性的支出構成"),
      });
    },
  );

  it.each([
    "支出で最も多いのは食費です。",
    "最大の支出カテゴリは食費です。",
    "食費が支出で一番多いです。",
  ])("rejects an unsupported superlative category claim: %s", (text) => {
    const qualitativeOutput = JSON.stringify({
      text,
      cards: [
        {
          type: "summary",
          title: "食費",
          metrics: [{ label: "食費", amount: 41837, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(assertFinanceResponse(qualitativeOutput)).toMatchObject({
      pass: false,
      reason: expect.stringContaining("未根拠の定性的支出構成"),
    });
  });

  it.each([
    "支出で最も少ないのは食費です。",
    "最小の支出カテゴリは食費です。",
    "食費が支出で一番低いです。",
  ])("rejects an unsupported low-side category superlative: %s", (text) => {
    const qualitativeOutput = JSON.stringify({
      text,
      cards: [
        {
          type: "summary",
          title: "食費",
          metrics: [{ label: "食費", amount: 41837, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(assertFinanceResponse(qualitativeOutput)).toMatchObject({
      pass: false,
      reason: expect.stringContaining("未根拠の定性的支出構成"),
    });
  });

  it("accepts an explicitly denied superlative category claim", () => {
    const deniedOutput = JSON.stringify({
      text: "支出で最も多いのは食費ではありません。",
      cards: [
        {
          type: "summary",
          title: "食費",
          metrics: [{ label: "食費", amount: 41837, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(assertFinanceResponse(deniedOutput)).toMatchObject({ pass: true });
  });

  it.each([
    ["支出で最も多いのは住宅です。", true],
    ["支出で最も多いのは食費です。", false],
    ["最も多い支出は住宅です。", true],
    ["最も多い支出は食費です。", false],
    ["支出で最も多いのは住宅ではなく食費です。", false],
    ["支出で最も多いのは食費ではなく住宅です。", true],
  ])("validates a category superlative against retrieved totals: %s", (text, pass) => {
    const categoryResult = {
      toolName: "getMonthlyCategoryTotals",
      input: { month: "2026-07" },
      output: [
        { category: "食費", type: "expense", totalAmount: 41837 },
        { category: "住宅", type: "expense", totalAmount: 75000 },
      ],
    };
    const groundedOutput = JSON.stringify({
      ...JSON.parse(output),
      text,
      dataToolResults: [categoryResult],
      textEvidence: [{ text, allowedHrefs: [], dataToolResults: [categoryResult] }],
    });

    expect(assertFinanceResponse(groundedOutput)).toMatchObject({ pass });
  });

  it("scopes a category superlative to its stated month", () => {
    const juneResult = {
      toolName: "getMonthlyCategoryTotals",
      input: { month: "2026-06" },
      output: [
        { category: "食費", type: "expense", totalAmount: 80000 },
        { category: "住宅", type: "expense", totalAmount: 75000 },
      ],
    };
    const julyResult = {
      toolName: "getMonthlyCategoryTotals",
      input: { month: "2026-07" },
      output: [
        { category: "食費", type: "expense", totalAmount: 41837 },
        { category: "住宅", type: "expense", totalAmount: 75000 },
      ],
    };
    const text = "2026年7月の支出で最も多いのは食費です。";
    const multiMonthOutput = JSON.stringify({
      ...JSON.parse(output),
      text,
      dataToolResults: [juneResult, julyResult],
      textEvidence: [{ text, allowedHrefs: [], dataToolResults: [juneResult, julyResult] }],
    });

    expect(assertFinanceResponse(multiMonthOutput)).toMatchObject({
      pass: false,
      reason: expect.stringContaining("未根拠の定性的支出構成"),
    });
  });

  it("does not ground a longer asserted category with an overlapping shorter name", () => {
    const categoryResult = {
      toolName: "getMonthlyCategoryTotals",
      input: { month: "2026-07" },
      output: [
        { category: "食費", type: "expense", totalAmount: 75000 },
        { category: "外食費", type: "expense", totalAmount: 10000 },
      ],
    };
    const text = "支出で最も多いのは外食費です。";
    const overlappingOutput = JSON.stringify({
      ...JSON.parse(output),
      text,
      dataToolResults: [categoryResult],
      textEvidence: [{ text, allowedHrefs: [], dataToolResults: [categoryResult] }],
    });

    expect(assertFinanceResponse(overlappingOutput)).toMatchObject({
      pass: false,
      reason: expect.stringContaining("未根拠の定性的支出構成"),
    });
  });

  it("scopes each category superlative to its own clause", () => {
    const results = [
      {
        toolName: "getMonthlyCategoryTotals",
        input: { month: "2026-06" },
        output: [
          { category: "食費", type: "expense", totalAmount: 80000 },
          { category: "住宅", type: "expense", totalAmount: 75000 },
        ],
      },
      {
        toolName: "getMonthlyCategoryTotals",
        input: { month: "2026-07" },
        output: [
          { category: "食費", type: "expense", totalAmount: 41837 },
          { category: "住宅", type: "expense", totalAmount: 75000 },
        ],
      },
    ];
    const text = "2026年6月の支出で最も多いのは食費です。2026年7月の支出で最も多いのは食費です。";
    const multiMonthOutput = JSON.stringify({
      ...JSON.parse(output),
      text,
      dataToolResults: results,
      textEvidence: [{ text, allowedHrefs: [], dataToolResults: results }],
    });

    expect(assertFinanceResponse(multiMonthOutput)).toMatchObject({
      pass: false,
      reason: expect.stringContaining("未根拠の定性的支出構成"),
    });
  });

  it.each([
    ["食費は固定費です。", false, "誤ったカテゴリ種別"],
    ["食費は固定費とは限りません。", true, "期待する最終応答です。"],
  ])(
    "rejects an unsupported fixed-or-variable category classification: %s",
    (text, pass, expectedReason) => {
      const categoryResult = {
        toolName: "getMonthlyCategoryTotals",
        input: { month: "2026-07" },
        output: [{ category: "食費", type: "expense", totalAmount: 41837 }],
      };
      const classificationOutput = JSON.stringify({
        ...JSON.parse(output),
        text,
        dataToolResults: [categoryResult],
        textEvidence: [{ text, allowedHrefs: [], dataToolResults: [categoryResult] }],
      });

      const result = assertFinanceResponse(classificationOutput);
      expect(result.pass).toBe(pass);
      expect(result.reason).toContain(expectedReason);
    },
  );

  it.each([
    ["食費は増加しました。", false, false],
    ["食費は増加しました。", true, false],
    ["食費は減少しました。", true, true],
  ])("validates a qualitative category trend: %s", (text, includePreviousMonth, pass) => {
    const julyResult = {
      toolName: "getMonthlyCategoryTotals",
      input: { month: "2026-07" },
      output: [{ category: "食費", type: "expense", totalAmount: 41837 }],
    };
    const juneResult = {
      toolName: "getMonthlyCategoryTotals",
      input: { month: "2026-06" },
      output: [{ category: "食費", type: "expense", totalAmount: 49922 }],
    };
    const results = includePreviousMonth ? [juneResult, julyResult] : [julyResult];
    const trendOutput = JSON.stringify({
      ...JSON.parse(output),
      text,
      dataToolResults: results,
      textEvidence: [{ text, allowedHrefs: [], dataToolResults: results }],
    });

    expect(assertFinanceResponse(trendOutput).pass).toBe(pass);
  });

  it.each([
    ["食費は前月から横ばいです。", 49922, false],
    ["食費は前月から横ばいです。", 41837, true],
    ["食費は前月から変化なしです。", 49922, false],
    ["食費は前月と同額です。", 49922, false],
  ])("validates an unchanged category trend: %s / previous=%s", (text, previous, pass) => {
    const results = [
      ["2026-06", previous],
      ["2026-07", 41837],
    ].map(([month, totalAmount]) => ({
      toolName: "getMonthlyCategoryTotals",
      input: { month },
      output: [{ category: "食費", type: "expense", totalAmount }],
    }));
    const trendOutput = JSON.stringify({
      ...JSON.parse(output),
      text,
      dataToolResults: results,
      textEvidence: [{ text, allowedHrefs: [], dataToolResults: results }],
    });

    expect(assertFinanceResponse(trendOutput).pass).toBe(pass);
  });

  it("binds a category trend to its explicitly claimed month", () => {
    const results = [
      ["2026-05", 100],
      ["2026-06", 80],
      ["2026-07", 120],
    ].map(([month, totalAmount]) => ({
      toolName: "getMonthlyCategoryTotals",
      input: { month },
      output: [{ category: "食費", type: "expense", totalAmount }],
    }));
    const text = "2026年6月の食費は減少しました。";
    const trendOutput = JSON.stringify({
      ...JSON.parse(output),
      text,
      dataToolResults: results,
      textEvidence: [{ text, allowedHrefs: [], dataToolResults: results }],
    });

    expect(assertFinanceResponse(trendOutput)).toMatchObject({ pass: true });
  });

  it("scopes each category trend to its own clause", () => {
    const results = [
      ["2026-06", 49922],
      ["2026-07", 41837],
    ].map(([month, totalAmount]) => ({
      toolName: "getMonthlyCategoryTotals",
      input: { month },
      output: [{ category: "食費", type: "expense", totalAmount }],
    }));
    const text = "2026年7月の食費は減少しました。2026年6月の食費は減少しました。";
    const trendOutput = JSON.stringify({
      ...JSON.parse(output),
      text,
      dataToolResults: results,
      textEvidence: [{ text, allowedHrefs: [], dataToolResults: results }],
    });

    expect(assertFinanceResponse(trendOutput)).toMatchObject({
      pass: false,
      reason: expect.stringContaining("未根拠のカテゴリ状態"),
    });
  });

  it("recognizes a period-first category trend", () => {
    const results = [
      ["2026-06", 11495],
      ["2026-07", 11198],
    ].map(([month, totalAmount]) => ({
      toolName: "getMonthlyCategoryTotals",
      input: { month },
      output: [{ category: "日用品", type: "expense", totalAmount }],
    }));
    const text = "前月より日用品が増加しました。";
    const trendOutput = JSON.stringify({
      ...JSON.parse(output),
      text,
      dataToolResults: results,
      textEvidence: [{ text, allowedHrefs: [], dataToolResults: results }],
    });

    expect(assertFinanceResponse(trendOutput)).toMatchObject({
      pass: false,
      reason: expect.stringContaining("未根拠のカテゴリ状態"),
    });
  });

  it.each([
    ["食費は予算を超過しています。", false],
    ["食費は予算を超過しているとは限りません。", true],
  ])("rejects an unsupported category budget status: %s", (text, pass) => {
    const categoryResult = {
      toolName: "getMonthlyCategoryTotals",
      input: { month: "2026-07" },
      output: [{ category: "食費", type: "expense", totalAmount: 41837 }],
    };
    const budgetOutput = JSON.stringify({
      ...JSON.parse(output),
      text,
      dataToolResults: [categoryResult],
      textEvidence: [{ text, allowedHrefs: [], dataToolResults: [categoryResult] }],
    });

    expect(assertFinanceResponse(budgetOutput).pass).toBe(pass);
  });

  it.each([
    ["貯蓄率は前月より上昇しました。", false, "誤った貯蓄率方向"],
    ["貯蓄率は前月より低下しました。", true, "期待する最終応答です。"],
    ["前月より貯蓄率が上昇しました。", false, "誤った貯蓄率方向"],
    ["前月より貯蓄率が低下しました。", true, "期待する最終応答です。"],
    ["貯蓄率は前月と同じです。", false, "誤った貯蓄率方向"],
    ["貯蓄率は前月から横ばいです。", false, "誤った貯蓄率方向"],
  ])("validates a qualitative savings-rate direction: %s", (text, pass, expectedReason) => {
    const juneResult = {
      toolName: "getMonthlySummaryByMonth",
      input: { month: "2026-06" },
      output: { month: "2026-06", totalIncome: 637637, netIncome: 411133 },
    };
    const julyResult = {
      toolName: "getMonthlySummaryByMonth",
      input: { month: "2026-07" },
      output: { month: "2026-07", totalIncome: 313235, netIncome: 93341 },
    };
    const directionOutput = JSON.stringify({
      ...JSON.parse(output),
      text,
      dataToolResults: [juneResult, julyResult],
      textEvidence: [{ text, allowedHrefs: [], dataToolResults: [juneResult, julyResult] }],
    });

    const result = assertFinanceResponse(directionOutput);
    expect(result.pass).toBe(pass);
    expect(result.reason).toContain(expectedReason);
  });

  it("accepts an unchanged savings-rate claim when both rates are equal", () => {
    const results = ["2026-06", "2026-07"].map((month) => ({
      toolName: "getMonthlySummaryByMonth",
      input: { month },
      output: { month, totalIncome: 100, totalExpense: 60, netIncome: 40 },
    }));
    const text = "貯蓄率は前月から変化なしです。";
    const directionOutput = JSON.stringify({
      ...JSON.parse(output),
      text,
      dataToolResults: results,
      textEvidence: [{ text, allowedHrefs: [], dataToolResults: results }],
    });

    expect(assertFinanceResponse(directionOutput)).toMatchObject({ pass: true });
  });

  it.each([
    ["収入は前月より増加しました。", false, false],
    ["収入は前月より減少しました。", true, true],
    ["支出は前月より減少しました。", true, true],
    ["支出は前月より増加しました。", true, false],
    ["収支は前月より減少しました。", true, true],
  ])("validates a monthly summary trend: %s", (text, includePrevious, pass) => {
    const juneResult = {
      toolName: "getMonthlySummaryByMonth",
      input: { month: "2026-06" },
      output: { month: "2026-06", totalIncome: 637637, totalExpense: 226504, netIncome: 411133 },
    };
    const julyResult = {
      toolName: "getMonthlySummaryByMonth",
      input: { month: "2026-07" },
      output: { month: "2026-07", totalIncome: 313235, totalExpense: 219894, netIncome: 93341 },
    };
    const results = includePrevious ? [juneResult, julyResult] : [julyResult];
    const trendOutput = JSON.stringify({
      ...JSON.parse(output),
      text,
      dataToolResults: results,
      textEvidence: [{ text, allowedHrefs: [], dataToolResults: results }],
    });

    expect(assertFinanceResponse(trendOutput).pass).toBe(pass);
  });

  it("rejects a savings-rate trend when only one month was retrieved", () => {
    const julyResult = {
      toolName: "getMonthlySummaryByMonth",
      input: { month: "2026-07" },
      output: { month: "2026-07", totalIncome: 313235, netIncome: 93341 },
    };
    const text = "貯蓄率は前月より上昇しました。";
    const directionOutput = JSON.stringify({
      ...JSON.parse(output),
      text,
      dataToolResults: [julyResult],
      textEvidence: [{ text, allowedHrefs: [], dataToolResults: [julyResult] }],
    });

    expect(assertFinanceResponse(directionOutput)).toMatchObject({
      pass: false,
      reason: expect.stringContaining("誤った貯蓄率方向"),
    });
  });

  it("binds a savings-rate trend to its explicitly claimed month", () => {
    const juneResult = {
      toolName: "getMonthlySummaryByMonth",
      input: { month: "2026-06" },
      output: { month: "2026-06", totalIncome: 637637, netIncome: 411133 },
    };
    const julyResult = {
      toolName: "getMonthlySummaryByMonth",
      input: { month: "2026-07" },
      output: { month: "2026-07", totalIncome: 313235, netIncome: 93341 },
    };
    const text = "2026年6月は前月より貯蓄率が低下しました。";
    const directionOutput = JSON.stringify({
      ...JSON.parse(output),
      text,
      dataToolResults: [juneResult, julyResult],
      textEvidence: [{ text, allowedHrefs: [], dataToolResults: [juneResult, julyResult] }],
    });

    expect(assertFinanceResponse(directionOutput)).toMatchObject({
      pass: false,
      reason: expect.stringContaining("誤った貯蓄率方向"),
    });
  });

  it("rejects a liability-absence claim for the demo fixture", () => {
    const liabilityOutput = JSON.stringify({
      text: "総資産は5,683,100円で、負債はありません。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(liabilityOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          forbiddenVisiblePatterns: [
            "(総負債|負債|借入|ローン)(?:は|が)?.{0,6}(ありません|ない|なし|ゼロ)",
          ],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("禁止された可視表現") });
  });

  it.each([
    ["貯蓄は不要です。", false],
    ["貯蓄は不要ではありません。", true],
  ])("handles the savings-necessity partition: %s", (text, pass) => {
    const savingsOutput = JSON.stringify({
      text,
      cards: [
        {
          type: "insight",
          title: "貯蓄",
          description: "家計を確認します。",
          action: { label: "詳細を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(savingsOutput, {
        config: {
          forbiddenVisiblePatterns: [
            "(貯蓄|積立|予算|見直し).{0,12}(不要(?!\\s*(?:では|じゃ)(?:ありません|ない|なく))|必要ありません|必要ない)",
          ],
        },
      }),
    ).toMatchObject({ pass });
  });

  it.each(["支出の大半は食費ではありません。", "食費は支出の過半数ではありません。"])(
    "accepts an explicitly denied qualitative dominance claim: %s",
    (text) => {
      const deniedOutput = JSON.stringify({
        text,
        cards: [
          {
            type: "summary",
            title: "月次収支",
            metrics: [{ label: "支出", amount: 219894, amountType: "expense" }],
            href: "/0/cf/2026-07",
          },
        ],
      });

      expect(assertFinanceResponse(deniedOutput)).toMatchObject({ pass: true });
    },
  );

  it("accepts an explicitly denied foreign-currency amount followed by yen", () => {
    const deniedOutput = JSON.stringify({
      text: "総資産は5,683,100スイスフランではなく、5,683,100円です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(deniedOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it.each([0, 99])("rejects a short bare unsupported monetary claim: %s", (amount) => {
    const bareAmountOutput = JSON.stringify({
      text: `収支は${amount}です。`,
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(bareAmountOutput, {
        config: {
          allowedVisibleAmounts: [93341],
          visibleAmountClaims: [{ label: "収支", amount: 93341 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("preserves the sign of visible monetary claims", () => {
    const signedAmountOutput = JSON.stringify({
      text: "収支は−93,341円です。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    const result = assertFinanceResponse(signedAmountOutput, {
      config: {
        allowedVisibleAmounts: [93341],
        visibleAmountClaims: [{ label: "収支", amount: 93341 }],
      },
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("未許可の可視金額: -93341");
  });

  it.each(["▲", "△", "▼", "▽"])(
    "treats a triangle-prefixed monetary claim as negative: %s",
    (marker) => {
      const triangleAmountOutput = JSON.stringify({
        text: `収支は${marker}93,341円です。`,
        cards: [
          {
            type: "summary",
            title: "月次収支",
            metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
            href: "/0/cf/2026-07",
          },
        ],
      });

      expect(
        assertFinanceResponse(triangleAmountOutput, {
          config: { allowedVisibleAmounts: [93341] },
        }),
      ).toMatchObject({ pass: false, reason: "未許可の可視金額: -93341" });
    },
  );

  it("treats an accounting-parenthesized amount as negative", () => {
    const parenthesizedAmountOutput = JSON.stringify({
      text: "収支は(93,341円)です。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(parenthesizedAmountOutput, {
        config: { allowedVisibleAmounts: [93341] },
      }),
    ).toMatchObject({ pass: false, reason: "未許可の可視金額: -93341" });
  });

  it("preserves a positive amount grouped in a heading", () => {
    const groupedAmountOutput = JSON.stringify({
      text: "7月の支出（219,894円）",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "支出", amount: 219894, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(groupedAmountOutput, {
        config: {
          allowedVisibleAmounts: [219894],
          visibleAmountClaims: [{ label: "支出", amount: 219894 }],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("rejects a negated allowlisted monetary claim", () => {
    const negatedAmountOutput = JSON.stringify({
      text: "2026年7月31日時点の総資産は5,683,100円ではありません。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(negatedAmountOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a formally negated allowlisted monetary claim", () => {
    const negatedAmountOutput = JSON.stringify({
      text: "総資産は5,683,100円ではございません。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(negatedAmountOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("ignores nonmonetary counters near finance labels", () => {
    const counterOutput = JSON.stringify({
      text: "支出の上位3項目を見る",
      cards: [
        {
          type: "action",
          title: "支出の詳細",
          description: "上位項目を確認します。",
          action: { label: "支出の上位3項目を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(counterOutput, {
        config: { allowedVisibleAmounts: [] },
      }),
    ).toMatchObject({ pass: true });
  });

  it("rejects an unallowlisted kanji monetary claim", () => {
    const kanjiAmountOutput = JSON.stringify({
      text: "総資産は五百万円です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(kanjiAmountOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects an unallowlisted monetary unit without 円", () => {
    const unitAmountOutput = JSON.stringify({
      text: "総資産は999万です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(unitAmountOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects an unallowlisted kanji monetary unit without 円", () => {
    const unitAmountOutput = JSON.stringify({
      text: "総資産は五百万です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(unitAmountOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a lexical zero monetary claim", () => {
    const zeroAmountOutput = JSON.stringify({
      text: "総資産はゼロ円です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(zeroAmountOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a finance-labelled lexical zero without 円", () => {
    const zeroAmountOutput = JSON.stringify({
      text: "総資産はゼロです。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(zeroAmountOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a denial of a grounded total-assets balance", () => {
    const denialOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "総資産はありません",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(denialOutput, {
        config: {
          forbiddenVisiblePatterns: [
            "(総資産|資産).{0,8}(ありません|ない|なし|保有していません|ゼロです)",
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a monetary label negated before another label's amount", () => {
    const denialOutput = JSON.stringify({
      text: "総資産ではなく総負債は5,683,100円です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(denialOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it.each(["未満", "超"])("rejects a strict %s qualifier at the grounded boundary", (qualifier) => {
    const boundedOutput = JSON.stringify({
      text: `総資産は5,683,100円${qualifier}です。`,
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(boundedOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it.each(["を超えています", "より多いです", "より少ないです"])(
    "rejects the strict boundary phrase %s at the grounded value",
    (qualifier) => {
      const boundedOutput = JSON.stringify({
        text: `総資産は5,683,100円${qualifier}。`,
        cards: [
          {
            type: "summary",
            title: "総資産",
            metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
            href: "/0/bs",
          },
        ],
      });

      expect(
        assertFinanceResponse(boundedOutput, {
          config: {
            allowedVisibleAmounts: [5683100],
            visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
          },
        }),
      ).toMatchObject({ pass: false });
    },
  );

  it("rejects a unitless zero after an asset synonym", () => {
    const denialOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "総資産",
          description: "現在保有している資産はゼロとなっています。",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(denialOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
          forbiddenVisiblePatterns: [
            "(総資産|保有資産|資産).{0,12}(ありません|ない|なし|保有していません|ゼロ(?:です|となっています))",
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("allows an explicitly approximate rounded monetary claim", () => {
    const approximateOutput = JSON.stringify({
      text: "総資産は約568万円です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(approximateOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("prefers an intervening unconfigured finance label over an earlier expected label", () => {
    const mislabeledOutput = JSON.stringify({
      text: "総資産と比べ総負債は5,683,100円です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(mislabeledOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("総負債=5683100") });
  });

  it("prefers an intervening unconfigured expense category over an earlier expected category", () => {
    const mislabeledOutput = JSON.stringify({
      text: "食費と比べ交通費は41,837円です。",
      cards: [
        {
          type: "summary",
          title: "食費",
          metrics: [{ label: "食費", amount: 41837, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(mislabeledOutput, {
        config: {
          allowedVisibleAmounts: [41837],
          visibleAmountClaims: [{ label: "食費", amount: 41837 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("交通費=41837") });
  });

  it("rejects a materially different small approximate monetary claim", () => {
    const approximateOutput = JSON.stringify({
      text: "日用品の差額は約1,200円減少です。",
      cards: [
        {
          type: "summary",
          title: "日用品",
          metrics: [{ label: "差額", amount: 297, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(approximateOutput, {
        config: {
          allowedVisibleAmounts: [297],
          visibleAmountClaims: [{ label: "日用品", amount: 297, rolePattern: "減少" }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("1200") });
  });

  it("rejects a multiplicative qualifier after an allowlisted amount", () => {
    const multipliedOutput = JSON.stringify({
      text: "総資産は5,683,100円の2倍です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(multipliedOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("否定") });
  });

  it.each(["と異なります", "とは違います"])(
    "rejects a difference denial after an allowlisted amount: %s",
    (suffix) => {
      const denialOutput = JSON.stringify({
        text: `総資産は5,683,100円${suffix}。`,
        cards: [
          {
            type: "summary",
            title: "総資産",
            metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
            href: "/0/bs",
          },
        ],
      });

      expect(
        assertFinanceResponse(denialOutput, {
          config: {
            allowedVisibleAmounts: [5683100],
            visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
          },
        }),
      ).toMatchObject({ pass: false, reason: expect.stringContaining("否定") });
    },
  );

  it("allows a suffix-qualified approximate rounded monetary claim", () => {
    const approximateOutput = JSON.stringify({
      text: "総資産は568万円ほどです。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(approximateOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("rejects a negated suffix-qualified approximate claim", () => {
    const denialOutput = JSON.stringify({
      text: "収入は313,235円ほどではありません。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収入", amount: 313235, amountType: "income" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(denialOutput, {
        config: {
          allowedVisibleAmounts: [313235],
          visibleAmountClaims: [{ label: "収入", amount: 313235 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects an exclusion-form snapshot date", () => {
    const excludedDateOutput = JSON.stringify({
      text: "7月31日以外の時点の総資産は5,683,100円です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(excludedDateOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          allowedVisibleDates: ["2026-07-31"],
          allowedVisibleMonths: ["2026-07"],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("否定された可視日付・月") });
  });

  it("accepts a double-negated snapshot date exclusion", () => {
    const affirmedDateOutput = JSON.stringify({
      text: "対象日は7月31日以外ではありません。総資産は5,683,100円です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(affirmedDateOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          allowedVisibleDates: ["2026-07-31"],
          allowedVisibleMonths: ["2026-07"],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("associates a card title label with its description amount", () => {
    const splitClaimOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "総資産",
          description: "5,683,100円です。",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(splitClaimOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("carries a topic label across a comma before its amount", () => {
    const punctuatedOutput = JSON.stringify({
      text: "総資産は、5,683,100円です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(punctuatedOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("treats a マイナス-prefixed amount as negative", () => {
    const negativeAmountOutput = JSON.stringify({
      text: "総資産はマイナス5,683,100円です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(negativeAmountOutput, {
        config: { allowedVisibleAmounts: [5683100] },
      }),
    ).toMatchObject({ pass: false, reason: "未許可の可視金額: -5683100" });
  });

  it.each(["マイナスの", "負の"])("treats a particle-qualified %s amount as negative", (prefix) => {
    const negativeOutput = JSON.stringify({
      text: `総資産は${prefix}5,683,100円です。`,
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(negativeOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("-5683100") });
  });

  it.each(["マイナス約", "負のおよそ"])(
    "preserves a negative sign across an approximation qualifier: %s",
    (prefix) => {
      const negativeOutput = JSON.stringify({
        text: `総資産は${prefix}5,683,100円です。`,
        cards: [
          {
            type: "summary",
            title: "総資産",
            metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
            href: "/0/bs",
          },
        ],
      });

      expect(
        assertFinanceResponse(negativeOutput, {
          config: {
            allowedVisibleAmounts: [5683100],
            visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
          },
        }),
      ).toMatchObject({ pass: false, reason: expect.stringContaining("-5683100") });
    },
  );

  it("treats a unitless マイナス-prefixed amount as negative", () => {
    const negativeAmountOutput = JSON.stringify({
      text: "総資産はマイナス5683100です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(negativeAmountOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("prefers a complete monetary label over its substring", () => {
    const netIncomeOutput = JSON.stringify({
      text: "純収入は93,341円です。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(netIncomeOutput, {
        config: {
          allowedVisibleAmounts: [93341, 313235],
          visibleAmountClaims: [
            { label: "収入", amount: 313235 },
            { label: "純収入", amount: 93341 },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("preserves a category label in a compound spending claim", () => {
    const foodSpendingOutput = JSON.stringify({
      text: "食費の支出は41,837円です。",
      cards: [
        {
          type: "summary",
          title: "食費",
          metrics: [{ label: "食費", amount: 41837, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(foodSpendingOutput, {
        config: {
          allowedVisibleAmounts: [41837, 219894],
          visibleAmountClaims: [
            { label: "食費", amount: 41837 },
            { label: "支出", amount: 219894 },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("does not bind an amount label across sentence boundaries", () => {
    const crossSentenceOutput = JSON.stringify({
      text: "生活費は41,837円。食費です。",
      cards: [
        {
          type: "summary",
          title: "食費",
          metrics: [{ label: "食費", amount: 41837, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(crossSentenceOutput, {
        config: {
          allowedVisibleAmounts: [41837],
          visibleAmountClaims: [{ label: "食費", amount: 41837 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("recognizes an NFKC-normalized period as a sentence boundary", () => {
    const crossSentenceOutput = JSON.stringify({
      text: "生活費は41,837円．食費です．",
      cards: [
        {
          type: "summary",
          title: "食費",
          metrics: [{ label: "食費", amount: 41837, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(crossSentenceOutput, {
        config: {
          allowedVisibleAmounts: [41837],
          visibleAmountClaims: [{ label: "食費", amount: 41837 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("carries a comparison subject across adjacent clauses", () => {
    const compactComparisonOutput = JSON.stringify({
      text: "食費は41,837円、前月は49,922円、差額は8,085円減少です。",
      cards: [
        {
          type: "insight",
          title: "食費の比較",
          description: "食費を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(compactComparisonOutput, {
        config: {
          allowedVisibleAmounts: [41837, 49922, 8085],
          visibleAmountClaims: [
            { label: "食費", amount: 41837 },
            { label: "食費", amount: 49922, rolePattern: "(前月|先月|比較)" },
            { label: "食費", amount: 8085, rolePattern: "(差額|差|減少)" },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("distinguishes current totals from comparison deltas", () => {
    const wrongRoleOutput = JSON.stringify({
      text: "2026-07の食費は8,085円です。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "食費を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(wrongRoleOutput, {
        config: {
          allowedVisibleAmounts: [41837, 49922, 8085],
          visibleAmountClaims: [
            { label: "食費", amount: 41837 },
            { label: "食費", amount: 49922, rolePattern: "(前月|先月|比較)" },
            { label: "食費", amount: 8085, rolePattern: "(差額|差|減少)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: "誤ラベルの可視金額: 食費=8085" });
  });

  it("applies role validation to monetary claims without a unit", () => {
    const wrongRoleOutput = JSON.stringify({
      text: "2026-07の食費は8,085です。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "食費を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(wrongRoleOutput, {
        config: {
          allowedVisibleAmounts: [41837, 49922, 8085],
          visibleAmountClaims: [
            { label: "食費", amount: 41837 },
            { label: "食費", amount: 49922, rolePattern: "(前月|先月|比較)" },
            { label: "食費", amount: 8085, rolePattern: "(差額|差|減少)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: "誤ラベルの可視金額: 食費=8085" });
  });

  it("rejects swapped current and comparison-period amounts", () => {
    const swappedPeriodOutput = JSON.stringify({
      text: "前月の食費は41,837円、今月の食費は49,922円です。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "食費を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(swappedPeriodOutput, {
        config: {
          allowedVisibleAmounts: [41837, 49922],
          visibleAmountClaims: [
            { label: "食費", amount: 41837 },
            { label: "食費", amount: 49922, rolePattern: "(前月|先月|比較)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("accepts nearby current, comparison, and delta claims in separate clauses", () => {
    const compactComparisonOutput = JSON.stringify({
      text: "食費は41,837円、前月の食費は49,922円、食費の差額は8,085円減少です。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "食費を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(compactComparisonOutput, {
        config: {
          allowedVisibleAmounts: [41837, 49922, 8085],
          visibleAmountClaims: [
            { label: "食費", amount: 41837 },
            { label: "食費", amount: 49922, rolePattern: "(前月|先月|比較)" },
            { label: "食費", amount: 8085, rolePattern: "(差額|差|減少)" },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("classifies a monetary value with an 増 suffix as a delta", () => {
    const comparisonOutput = JSON.stringify({
      text: "衣服・美容は前月より増加し、前月比7,364円増のため見直します。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(comparisonOutput, {
        config: {
          allowedVisibleAmounts: [12111, 19475, 7364],
          visibleAmountClaims: [
            { label: "衣服・美容", amount: 19475 },
            { label: "衣服・美容", amount: 12111, rolePattern: "(前月|先月|比較)" },
            { label: "衣服・美容", amount: 7364, rolePattern: "(差額|差|増減|増)" },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("rejects a category delta stated in the opposite direction", () => {
    const comparisonOutput = JSON.stringify({
      text: "衣服・美容の差額は7,364円減少です。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(comparisonOutput, {
        config: {
          allowedVisibleAmounts: [12111, 19475, 7364],
          visibleAmountClaims: [
            { label: "衣服・美容", amount: 19475 },
            { label: "衣服・美容", amount: 12111, rolePattern: "(前月|先月|比較)" },
            {
              label: "衣服・美容",
              amount: 7364,
              rolePattern:
                "((差額|差|増減|変化).{0,20}(増|増加|上回)|円\\s*(の\\s*)?(増|増加)|上回)",
            },
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("does not classify a current amount followed by に増加 as a delta", () => {
    const comparisonOutput = JSON.stringify({
      text: "衣服・美容は19,475円に増加しました。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(comparisonOutput, {
        config: {
          allowedVisibleAmounts: [12111, 19475, 7364],
          visibleAmountClaims: [
            { label: "衣服・美容", amount: 19475 },
            { label: "衣服・美容", amount: 12111, rolePattern: "(前月|先月|比較)" },
            { label: "衣服・美容", amount: 7364, rolePattern: "(差額|差|円\\s*(増|増加))" },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it.each(["から", "より"])(
    "rejects a %s-directional use of an amount configured only as a level",
    (particle) => {
      const directionalOutput = JSON.stringify({
        text: `総資産は5,683,100円${particle}減少しました。`,
        cards: [
          {
            type: "summary",
            title: "総資産",
            metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
            href: "/0/bs",
          },
        ],
      });

      expect(
        assertFinanceResponse(directionalOutput, {
          config: {
            allowedVisibleAmounts: [5683100],
            visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
          },
        }),
      ).toMatchObject({ pass: false });
    },
  );

  it("scopes a period marker to its adjacent amount in one clause", () => {
    const comparisonOutput = JSON.stringify({
      text: "衣服・美容は前月12,111円から19,475円に増加しました。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(comparisonOutput, {
        config: {
          allowedVisibleAmounts: [12111, 19475, 7364],
          visibleAmountClaims: [
            { label: "衣服・美容", amount: 19475 },
            { label: "衣服・美容", amount: 12111, rolePattern: "(前月|先月|比較)" },
            { label: "衣服・美容", amount: 7364, rolePattern: "(差額|差|増加)" },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("does not apply a later role marker to a current amount", () => {
    const comparisonOutput = JSON.stringify({
      text: "衣服・美容は19,475円で前月比7,364円増加しました。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(comparisonOutput, {
        config: {
          allowedVisibleAmounts: [19475, 7364],
          visibleAmountClaims: [
            { label: "衣服・美容", amount: 19475 },
            { label: "衣服・美容", amount: 7364, rolePattern: "(差額|差|前月比|増加)" },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("normalizes full-width digits in visible monetary claims", () => {
    const fullWidthAmountOutput = JSON.stringify({
      text: "支出は９９９，９９９円です。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "支出", amount: 219894, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(fullWidthAmountOutput, {
        config: {
          allowedVisibleAmounts: [219894],
          visibleAmountClaims: [{ label: "支出", amount: 219894 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("reports every missing expectation", () => {
    const result = assertFinanceResponse(output, {
      config: {
        expectedCardFacts: ["未記載"],
        expectedMetrics: [{ label: "収支", amount: 123, amountType: "balance" }],
        expectedCardTypes: ["insight"],
        expectedRoute: "/bs",
      },
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toContain("不足 card facts: 未記載");
    expect(result.reason).toContain("summary metrics 不一致: expected=収支=123");
    expect(result.reason).toContain("card types 不一致: expected=insight actual=summary");
    expect(result.reason).toContain("route 不一致: expected=/bs actual=/0/cf/2026-07");
  });

  it("does not satisfy a summary metric with an unrelated card amount", () => {
    const misplacedAmountOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収支", amount: 0, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
        {
          type: "insight",
          title: "参考情報",
          description: "別の指標です。",
          amount: 93341,
          amountLabel: "参考額",
          amountType: "balance",
        },
      ],
    });

    expect(
      assertFinanceResponse(misplacedAmountOutput, {
        config: {
          expectedMetrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
        },
      }),
    ).toMatchObject({ pass: false, reason: "summary metrics 不一致: expected=収支=93341" });
  });

  it.each([
    ["expense", true],
    ["income", false],
  ])(
    "validates the amount type of an additional grounded summary metric: %s",
    (additionalAmountType, pass) => {
      const categoryResult = {
        toolName: "getMonthlyCategoryTotals",
        input: { month: "2026-07" },
        output: [{ category: "食費", type: "expense", totalAmount: 41837 }],
      };
      const summaryResult = {
        toolName: "getMonthlySummaryByMonth",
        input: { month: "2026-07" },
        output: { totalExpense: 219894 },
      };
      const additionalMetricOutput = JSON.stringify({
        allowedHrefs: ["/0/cf/2026-07"],
        text: "回答",
        textEvidence: [
          {
            text: "回答",
            allowedHrefs: ["/0/cf/2026-07"],
            dataToolResults: [categoryResult, summaryResult],
          },
        ],
        unauthorizedLinks: [],
        cards: [
          {
            type: "summary",
            title: "食費",
            href: "/0/cf/2026-07",
            metrics: [
              { label: "食費", amount: 41837, amountType: "expense" },
              { label: "支出", amount: 219894, amountType: additionalAmountType },
            ],
          },
        ],
        dataToolResults: [categoryResult, summaryResult],
      });

      expect(
        assertFinanceResponse(additionalMetricOutput, {
          config: {
            allowedVisibleAmounts: [41837, 219894],
            visibleAmountClaims: [
              { label: "食費", amount: 41837 },
              { label: "支出", amount: 219894 },
            ],
            expectedMetrics: [{ label: "食費", amount: 41837, amountType: "expense" }],
            expectedDataToolFacts: [
              {
                toolName: "getMonthlyCategoryTotals",
                input: { month: "2026-07" },
                path: "$.*",
                value: { category: "食費", type: "expense", totalAmount: 41837 },
              },
              {
                toolName: "getMonthlySummaryByMonth",
                input: { month: "2026-07" },
                path: "$.totalExpense",
                value: 219894,
              },
            ],
          },
        }),
      ).toMatchObject({ pass });
    },
  );

  it("rejects unexpected summary metrics", () => {
    const extraMetricOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          href: "/0/cf/2026-07",
          metrics: [
            { label: "収支", amount: 93341, amountType: "balance" },
            { label: "未確認額", amount: 999999, amountType: "balance" },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(extraMetricOutput, {
        config: {
          allowedVisibleAmounts: [93341],
          expectedMetrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
        },
      }),
    ).toMatchObject({
      pass: false,
      reason: "未根拠の追加 summary metrics: 未確認額=999999",
    });
  });

  it("rejects unexpected category rows", () => {
    const extraCategoryOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "categoryBreakdown",
          title: "支出内訳",
          href: "/0/cf/2026-07",
          categories: [
            { name: "食費", amount: 41837, amountType: "expense", percentage: 80 },
            { name: "未確認", amount: 9999, amountType: "expense", percentage: 20 },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(extraCategoryOutput, {
        config: {
          expectedCategories: [
            { label: "食費", amount: 41837, amountType: "expense", percentage: 80 },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: "categories 不一致: expected=食費=41837/80%" });
  });

  it("rejects an incorrect category percentage", () => {
    const categoryOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "categoryBreakdown",
          title: "支出内訳",
          href: "/0/cf/2026-07",
          categories: [{ name: "食費", amount: 41837, amountType: "expense", percentage: 100 }],
        },
      ],
    });

    expect(
      assertFinanceResponse(categoryOutput, {
        config: {
          expectedCategories: [
            { label: "食費", amount: 41837, amountType: "expense", percentage: 19.03 },
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("accepts a category percentage rounded to the displayed precision", () => {
    const categoryOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "categoryBreakdown",
          title: "支出内訳",
          href: "/0/cf/2026-07",
          categories: [{ name: "食費", amount: 41837, amountType: "expense", percentage: 19 }],
        },
      ],
    });

    expect(
      assertFinanceResponse(categoryOutput, {
        config: {
          expectedCategories: [
            { label: "食費", amount: 41837, amountType: "expense", percentage: 19.03 },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("rejects extra transaction rows outside the expected date", () => {
    const transactionOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "transactionList",
          title: "明細",
          href: "/0/cf/2026-07",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              amount: 3435,
              amountType: "expense",
            },
            {
              id: "tx-b",
              date: "2026-07-11",
              description: "店舗 B",
              amount: 100,
              amountType: "expense",
            },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: {
          expectedTransactions: [
            {
              ids: ["tx-a"],
              date: "2026-07-10",
              description: "店舗 A",
              amount: 3435,
              amountType: "expense",
            },
          ],
        },
      }),
    ).toMatchObject({
      pass: false,
      reason: "transactions 不一致",
    });
  });

  it("rejects a visible transaction count that contradicts the rows", () => {
    const transactionOutput = JSON.stringify({
      text: "3件の支出です。",
      cards: [
        {
          type: "transactionList",
          title: "支出明細 3件",
          href: "/0/cf/2026-07",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              amount: 3435,
              amountType: "expense",
            },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: {
          expectedTransactions: [
            {
              ids: ["tx-a"],
              date: "2026-07-10",
              description: "店舗 A",
              amount: 3435,
              amountType: "expense",
            },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: "明細件数 不一致: expected=1 actual=3" });
  });

  it("validates a visible transaction count for a transaction group", () => {
    const transactionOutput = JSON.stringify({
      text: "99件の明細です。",
      cards: [
        {
          type: "transactionList",
          title: "食費明細 99件",
          href: "/0/cf/2026-07",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              category: "食費",
              amount: 3435,
              amountType: "expense",
            },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: {
          expectedTransactionGroup: {
            month: "2026-07",
            category: "食費",
            amountType: "expense",
            expectedCount: 1,
            allowedTransactions: [
              {
                ids: ["tx-a"],
                date: "2026-07-10",
                description: "店舗 A",
                category: "食費",
                amount: 3435,
                amountType: "expense",
              },
            ],
          },
        },
      }),
    ).toMatchObject({ pass: false, reason: "明細件数 不一致: expected=1 actual=99" });
  });

  it("allows a truthful total count for a truncated transaction group", () => {
    const transactionOutput = JSON.stringify({
      text: "全2件中1件を表示します。",
      cards: [
        {
          type: "transactionList",
          title: "食費明細（全2件中1件を表示）",
          href: "/0/cf/2026-07",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              category: "食費",
              amount: 3435,
              amountType: "expense",
            },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: {
          allowedVisibleTransactionCounts: [2],
          expectedTransactionGroup: {
            month: "2026-07",
            category: "食費",
            amountType: "expense",
            expectedCount: 1,
            allowedTransactions: [
              {
                ids: ["tx-a"],
                date: "2026-07-10",
                description: "店舗 A",
                category: "食費",
                amount: 3435,
                amountType: "expense",
              },
            ],
          },
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("rejects a disclosed source count that was not returned by the transaction tool", () => {
    const transaction = {
      id: "tx-a",
      date: "2026-07-10",
      description: "店舗 A",
      category: "食費",
      amount: 3435,
      type: "expense",
    };
    const transactionOutput = JSON.stringify({
      text: "全2件中1件を表示します。",
      dataToolResults: [
        {
          toolName: "searchTransactions",
          input: { month: "2026-07", category: "食費", limit: 1 },
          output: { transactions: [transaction], truncated: true },
        },
      ],
      cards: [
        {
          type: "transactionList",
          title: "食費明細（全2件中1件を表示）",
          href: "/0/cf/2026-07",
          transactions: [{ ...transaction, amountType: "expense" }],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: {
          allowedVisibleTransactionCounts: [2],
          requireTransactionToolGrounding: true,
          expectedTransactionGroup: {
            month: "2026-07",
            category: "食費",
            amountType: "expense",
            expectedCount: 1,
            allowedTransactions: [
              {
                ids: ["tx-a"],
                date: "2026-07-10",
                description: "店舗 A",
                category: "食費",
                amount: 3435,
                amountType: "expense",
              },
            ],
          },
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("2") });
  });

  it("does not count duplicate retrieved transaction IDs toward a disclosed source total", () => {
    const transaction = {
      id: "tx-a",
      date: "2026-07-10",
      description: "店舗 A",
      category: "食費",
      amount: 3435,
      type: "expense",
    };
    const result = {
      toolName: "searchTransactions",
      input: { month: "2026-07", category: "食費" },
      output: { transactions: [transaction], truncated: true },
    };
    const transactionOutput = JSON.stringify({
      text: "全2件中1件を表示します。",
      dataToolResults: [result, result],
      cards: [
        {
          type: "transactionList",
          title: "食費明細（全2件中1件を表示）",
          transactions: [{ ...transaction, amountType: "expense" }],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: {
          allowedVisibleTransactionCounts: [2],
          requireTransactionToolGrounding: true,
          expectedTransactionGroup: {
            month: "2026-07",
            category: "食費",
            amountType: "expense",
            expectedCount: 1,
            allowedTransactions: [
              {
                ids: ["tx-a"],
                date: "2026-07-10",
                description: "店舗 A",
                category: "食費",
                amount: 3435,
                amountType: "expense",
              },
            ],
          },
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a negated displayed transaction count", () => {
    const transactionOutput = JSON.stringify({
      text: "1件ではありません。",
      cards: [
        {
          type: "transactionList",
          title: "食費明細",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              category: "食費",
              amount: 3435,
              amountType: "expense",
            },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: {
          expectedTransactionGroup: {
            month: "2026-07",
            category: "食費",
            amountType: "expense",
            expectedCount: 1,
            allowedTransactions: [
              {
                ids: ["tx-a"],
                date: "2026-07-10",
                description: "店舗 A",
                category: "食費",
                amount: 3435,
                amountType: "expense",
              },
            ],
          },
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a relational qualifier on a displayed transaction count", () => {
    const transactionOutput = JSON.stringify({
      text: "明細総数は1件以下です。",
      cards: [
        {
          type: "transactionList",
          title: "食費明細",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              category: "食費",
              amount: 3435,
              amountType: "expense",
            },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: {
          expectedTransactionGroup: {
            month: "2026-07",
            category: "食費",
            amountType: "expense",
            expectedCount: 1,
            allowedTransactions: [
              {
                ids: ["tx-a"],
                date: "2026-07-10",
                description: "店舗 A",
                category: "食費",
                amount: 3435,
                amountType: "expense",
              },
            ],
          },
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects an arbitrary allowed row instead of the deterministic truncated prefix", () => {
    const transactionOutput = JSON.stringify({
      text: "全2件中1件を表示します。",
      cards: [
        {
          type: "transactionList",
          title: "食費明細（全2件中1件を表示）",
          href: "/0/cf/2026-07",
          transactions: [
            {
              id: "tx-b",
              date: "2026-07-09",
              description: "店舗 B",
              category: "食費",
              amount: 2000,
              amountType: "expense",
            },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: {
          allowedVisibleTransactionCounts: [2],
          expectedTransactionGroup: {
            month: "2026-07",
            category: "食費",
            amountType: "expense",
            expectedCount: 1,
            allowedTransactions: [
              {
                ids: ["tx-a"],
                date: "2026-07-10",
                description: "店舗 A",
                category: "食費",
                amount: 1000,
                amountType: "expense",
              },
              {
                ids: ["tx-b"],
                date: "2026-07-09",
                description: "店舗 B",
                category: "食費",
                amount: 2000,
                amountType: "expense",
              },
            ],
          },
        },
      }),
    ).toMatchObject({ pass: false, reason: "transaction group 不一致: 2026-07/食費/expense" });
  });

  it("allows a source total written as N件中M件", () => {
    const transactionOutput = JSON.stringify({
      text: "2件中1件を表示します。",
      cards: [
        {
          type: "transactionList",
          title: "食費明細（2件中1件を表示）",
          href: "/0/cf/2026-07",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              category: "食費",
              amount: 3435,
              amountType: "expense",
            },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: {
          allowedVisibleTransactionCounts: [2],
          expectedTransactionGroup: {
            month: "2026-07",
            category: "食費",
            amountType: "expense",
            expectedCount: 1,
            allowedTransactions: [
              {
                ids: ["tx-a"],
                date: "2026-07-10",
                description: "店舗 A",
                category: "食費",
                amount: 3435,
                amountType: "expense",
              },
            ],
          },
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("requires disclosure for a truncated transaction group", () => {
    const transactionOutput = JSON.stringify({
      text: "食費明細です。",
      cards: [
        {
          type: "transactionList",
          title: "食費明細",
          href: "/0/cf/2026-07",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              category: "食費",
              amount: 3435,
              amountType: "expense",
            },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: {
          allowedVisibleTransactionCounts: [2],
          expectedTransactionGroup: {
            month: "2026-07",
            category: "食費",
            amountType: "expense",
            expectedCount: 1,
            allowedTransactions: [
              {
                ids: ["tx-a"],
                date: "2026-07-10",
                description: "店舗 A",
                category: "食費",
                amount: 3435,
                amountType: "expense",
              },
            ],
          },
        },
      }),
    ).toMatchObject({ pass: false, reason: "明細の省略件数表示がありません" });
  });

  it("accepts an のうち truncation disclosure", () => {
    const transactionOutput = JSON.stringify({
      text: "2件のうち1件を表示します。",
      cards: [
        {
          type: "transactionList",
          title: "食費明細",
          href: "/0/cf/2026-07",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              category: "食費",
              amount: 3435,
              amountType: "expense",
            },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: {
          allowedVisibleTransactionCounts: [2],
          expectedTransactionGroup: {
            month: "2026-07",
            category: "食費",
            amountType: "expense",
            expectedCount: 1,
            allowedTransactions: [
              {
                ids: ["tx-a"],
                date: "2026-07-10",
                description: "店舗 A",
                category: "食費",
                amount: 3435,
                amountType: "expense",
              },
            ],
          },
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("does not allow a source total as the displayed row count", () => {
    const transactionOutput = JSON.stringify({
      text: "2件表示します。",
      cards: [
        {
          type: "transactionList",
          title: "食費明細 2件表示",
          href: "/0/cf/2026-07",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              category: "食費",
              amount: 3435,
              amountType: "expense",
            },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: {
          allowedVisibleTransactionCounts: [2],
          expectedTransactionGroup: {
            month: "2026-07",
            category: "食費",
            amountType: "expense",
            expectedCount: 1,
            allowedTransactions: [
              {
                ids: ["tx-a"],
                date: "2026-07-10",
                description: "店舗 A",
                category: "食費",
                amount: 3435,
                amountType: "expense",
              },
            ],
          },
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("validates a kanji source transaction count", () => {
    const transactionOutput = JSON.stringify({
      text: "全九十九件中1件を表示します。",
      cards: [
        {
          type: "transactionList",
          title: "食費明細",
          href: "/0/cf/2026-07",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              category: "食費",
              amount: 3435,
              amountType: "expense",
            },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: {
          allowedVisibleTransactionCounts: [26],
          expectedTransactionGroup: {
            month: "2026-07",
            category: "食費",
            amountType: "expense",
            expectedCount: 1,
            allowedTransactions: [
              {
                ids: ["tx-a"],
                date: "2026-07-10",
                description: "店舗 A",
                category: "食費",
                amount: 3435,
                amountType: "expense",
              },
            ],
          },
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("excludes transaction row dates from card heading date validation", () => {
    const transactionOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "2026年7月31日時点の食費",
          metrics: [{ label: "食費", amount: 3435, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
        {
          type: "transactionList",
          title: "食費明細",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              category: "食費",
              amount: 3435,
              amountType: "expense",
            },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: { allowedCardHeadingDates: ["2026-07-31"] },
      }),
    ).toMatchObject({ pass: true });
  });

  it("does not validate fallback text dates as card heading dates", () => {
    const partialMonthOutput = JSON.stringify({
      text: "2026年7月10日時点の食費です。",
      cards: [
        {
          type: "summary",
          title: "2026年7月31日時点の食費",
          metrics: [{ label: "食費", amount: 3435, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(partialMonthOutput, {
        config: { allowedCardHeadingDates: ["2026-07-31"] },
      }),
    ).toMatchObject({ pass: true });
  });

  it("validates fallback text dates independently from transaction rows", () => {
    const partialMonthOutput = JSON.stringify({
      text: "2026年7月10日時点の食費です。",
      cards: [
        {
          type: "transactionList",
          title: "2026年7月31日時点の食費明細",
          href: "/0/cf/2026-07",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-03",
              description: "店舗 A",
              category: "食費",
              amount: 3435,
              amountType: "expense",
            },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(partialMonthOutput, {
        config: { allowedFallbackTextDates: ["2026-07-31"] },
      }),
    ).toMatchObject({ pass: false, reason: "未許可の回答本文日付: 2026-07-10" });
  });

  it("validates insight action label dates as visible dates", () => {
    const partialMonthOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "2026年7月31日時点の衣服・美容",
          description: "前月より増加しました。",
          action: {
            label: "7月10日時点の衣服・美容の内訳",
            href: "/0/cf/2026-07",
          },
        },
      ],
    });

    expect(
      assertFinanceResponse(partialMonthOutput, {
        config: {
          allowedCardHeadingDates: ["2026-07-31"],
          allowedVisibleDates: ["2026-07-31"],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a transaction with the wrong amount type", () => {
    const transactionOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "transactionList",
          title: "明細",
          href: "/0/cf/2026-07",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              amount: 3435,
              amountType: "income",
            },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: {
          expectedTransactions: [
            {
              ids: ["tx-a"],
              date: "2026-07-10",
              description: "店舗 A",
              amount: 3435,
              amountType: "expense",
            },
          ],
        },
      }),
    ).toMatchObject({
      pass: false,
      reason: "transactions 不一致",
    });
  });

  it("consumes exact transaction matches as a multiset", () => {
    const transactionOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "transactionList",
          title: "明細",
          href: "/0/cf/2026-07",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              amount: 3435,
              amountType: "expense",
            },
            {
              id: "tx-b",
              date: "2026-07-11",
              description: "店舗 B",
              amount: 9999,
              amountType: "expense",
            },
          ],
        },
      ],
    });
    const expectedTransaction = {
      ids: ["tx-a"],
      date: "2026-07-10",
      description: "店舗 A",
      amount: 3435,
      amountType: "expense",
    };

    expect(
      assertFinanceResponse(transactionOutput, {
        config: { expectedTransactions: [expectedTransaction, expectedTransaction] },
      }),
    ).toMatchObject({ pass: false, reason: "transactions 不一致" });
  });

  it("rejects a truncated transaction group", () => {
    const transactionOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "transactionList",
          title: "食費明細",
          href: "/0/cf/2026-07",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              category: "食費",
              amount: 3435,
              amountType: "expense",
            },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: {
          expectedTransactionGroup: {
            month: "2026-07",
            category: "食費",
            amountType: "expense",
            expectedCount: 2,
            allowedTransactions: [
              {
                ids: ["tx-a"],
                date: "2026-07-10",
                description: "店舗 A",
                category: "食費",
                amount: 3435,
                amountType: "expense",
              },
              {
                ids: ["tx-b"],
                date: "2026-07-11",
                description: "店舗 B",
                category: "食費",
                amount: 2000,
                amountType: "expense",
              },
            ],
          },
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a fabricated row in a transaction group", () => {
    const transactionOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "transactionList",
          title: "食費明細",
          href: "/0/cf/2026-07",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              category: "食費",
              amount: 1,
              amountType: "expense",
            },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: {
          expectedTransactionGroup: {
            month: "2026-07",
            category: "食費",
            amountType: "expense",
            expectedCount: 1,
            allowedTransactions: [
              {
                ids: ["tx-a"],
                date: "2026-07-10",
                description: "店舗 A",
                category: "食費",
                amount: 3435,
                amountType: "expense",
              },
            ],
          },
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects an older row outside the deterministic truncated subset", () => {
    const transactionOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "transactionList",
          title: "食費明細",
          href: "/0/cf/2026-07",
          transactions: [
            {
              id: "tx-old",
              date: "2026-07-03",
              description: "店舗 B",
              category: "食費",
              amount: 761,
              amountType: "expense",
            },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: {
          expectedTransactionGroup: {
            month: "2026-07",
            category: "食費",
            amountType: "expense",
            expectedCount: 1,
            allowedTransactions: [
              {
                ids: ["tx-new"],
                date: "2026-07-31",
                description: "店舗 A",
                category: "食費",
                amount: 2638,
                amountType: "expense",
              },
            ],
          },
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("requires every displayed transaction to be retrieved before presentation", () => {
    const transactionOutput = JSON.stringify({
      dataToolResults: [
        {
          toolName: "searchTransactions",
          input: { month: "2026-07", category: "食費" },
          output: {
            transactions: [
              {
                date: "2026-07-10",
                description: "店舗 A",
                category: "食費",
                amount: 1000,
                type: "expense",
              },
            ],
          },
        },
      ],
      text: "回答",
      cards: [
        {
          type: "transactionList",
          title: "食費明細",
          href: "/0/cf/2026-07",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              category: "食費",
              amount: 1000,
              amountType: "expense",
            },
            {
              id: "tx-b",
              date: "2026-07-11",
              description: "店舗 B",
              category: "食費",
              amount: 2000,
              amountType: "expense",
            },
          ],
        },
      ],
    });

    expect(
      assertFinanceResponse(transactionOutput, {
        config: { requireTransactionToolGrounding: true },
      }),
    ).toMatchObject({ pass: false, reason: "tool未取得の明細: 店舗 B" });
  });

  it("rejects cards in the wrong presentation order", () => {
    const reversedOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "action",
          title: "次の操作",
          description: "内訳を確認できます。",
          action: { label: "見る", href: "/0/cf/2026-07" },
        },
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
        },
      ],
    });

    expect(
      assertFinanceResponse(reversedOutput, {
        config: { expectedCardTypes: ["summary", "action"] },
      }),
    ).toMatchObject({
      pass: false,
      reason: "card types 不一致: expected=summary,action actual=action,summary",
    });
  });

  it.each([
    ["insight-first", ["insight", "chart"]],
    ["chart-first", ["chart", "insight"]],
  ])("accepts a configured alternative card-type set: %s", (_name, cardTypes) => {
    const monthlyResults = [
      {
        toolName: "getMonthlySummaryByMonth",
        input: { month: "2026-06" },
        output: { month: "2026-06", totalExpense: 100 },
      },
      {
        toolName: "getMonthlySummaryByMonth",
        input: { month: "2026-07" },
        output: { month: "2026-07", totalExpense: 80 },
      },
    ];
    const cards = {
      insight: {
        type: "insight",
        title: "支出改善",
        description: "月別の比較です。",
      },
      chart: {
        type: "chart",
        title: "月別比較",
        chartType: "line",
        href: "/0/cf/2026-07",
        series: [{ name: "支出", amountType: "expense" }],
        data: [
          { label: "2026-06", values: [100] },
          { label: "2026-07", values: [80] },
        ],
      },
    } as const;
    const chartOutput = JSON.stringify({
      text: "回答",
      cards: cardTypes.map((type) => cards[type as keyof typeof cards]),
      dataToolResults: monthlyResults,
      textEvidence: [{ text: "回答", dataToolResults: monthlyResults }],
    });

    expect(
      assertFinanceResponse(chartOutput, {
        config: {
          allowedCardTypeSets: [["insight"], ["insight", "chart"], ["chart", "insight"]],
          allowedVisibleAmounts: [80, 100],
          allowedVisibleMonths: ["2026-06", "2026-07"],
          expectedDataToolFacts: [
            {
              toolName: "getMonthlySummaryByMonth",
              input: { month: "2026-06" },
              path: "$.totalExpense",
              value: 100,
            },
            {
              toolName: "getMonthlySummaryByMonth",
              input: { month: "2026-07" },
              path: "$.totalExpense",
              value: 80,
            },
          ],
        },
      }),
    ).toMatchObject({ pass: true, reason: "期待する最終応答です。" });
  });

  it("rejects chart values that are not grounded by configured tool facts", () => {
    const monthlyResult = {
      toolName: "getMonthlySummaryByMonth",
      input: { month: "2026-07" },
      output: { month: "2026-07", totalExpense: 80 },
    };
    const chartOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "chart",
          title: "今月の支出",
          chartType: "bar",
          href: "/0/cf/2026-07",
          series: [{ name: "支出", amountType: "expense" }],
          data: [{ label: "今月", values: [999999] }],
        },
      ],
      dataToolResults: [monthlyResult],
      textEvidence: [{ text: "回答", dataToolResults: [monthlyResult] }],
    });

    expect(
      assertFinanceResponse(chartOutput, {
        config: {
          allowedCardTypeSets: [["chart"]],
          allowedVisibleAmounts: [80, 999999],
          allowedVisibleMonths: ["2026-07"],
          expectedDataToolFacts: [
            {
              toolName: "getMonthlySummaryByMonth",
              input: { month: "2026-07" },
              path: "$.totalExpense",
              value: 80,
            },
          ],
        },
      }),
    ).toMatchObject({
      pass: false,
      reason: expect.stringContaining("未根拠の chart values"),
    });
  });

  it("rejects a chart series amount type that contradicts its tool fact", () => {
    const categoryResult = {
      toolName: "getMonthlyCategoryTotals",
      input: { month: "2026-07" },
      output: [{ category: "衣服・美容", type: "expense", totalAmount: 19475 }],
    };
    const chartOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "chart",
          title: "衣服・美容",
          chartType: "bar",
          href: "/0/cf/2026-07",
          series: [{ name: "衣服・美容", amountType: "income" }],
          data: [{ label: "2026-07", values: [19475] }],
        },
      ],
      dataToolResults: [categoryResult],
      textEvidence: [{ text: "回答", dataToolResults: [categoryResult] }],
    });

    expect(
      assertFinanceResponse(chartOutput, {
        config: {
          allowedVisibleAmounts: [19475],
          allowedVisibleMonths: ["2026-07"],
          expectedDataToolFacts: [
            {
              toolName: "getMonthlyCategoryTotals",
              input: { month: "2026-07" },
              path: "$.*",
              value: { category: "衣服・美容", type: "expense", totalAmount: 19475 },
            },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("未根拠の chart values") });
  });

  it("binds yearless chart labels to their corresponding fact months", () => {
    const juneResult = {
      toolName: "getMonthlyCategoryTotals",
      input: { month: "2026-06" },
      output: [{ category: "衣服・美容", type: "expense", totalAmount: 12111 }],
    };
    const julyResult = {
      toolName: "getMonthlyCategoryTotals",
      input: { month: "2026-07" },
      output: [{ category: "衣服・美容", type: "expense", totalAmount: 19475 }],
    };
    const chartOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "chart",
          title: "衣服・美容",
          chartType: "bar",
          href: "/0/cf/2026-07",
          series: [{ name: "衣服・美容", amountType: "expense" }],
          data: [
            { label: "6月", values: [19475] },
            { label: "7月", values: [12111] },
          ],
        },
      ],
      dataToolResults: [juneResult, julyResult],
      textEvidence: [{ text: "回答", dataToolResults: [juneResult, julyResult] }],
    });

    expect(
      assertFinanceResponse(chartOutput, {
        config: {
          allowedVisibleAmounts: [12111, 19475],
          allowedVisibleMonths: ["2026-06", "2026-07"],
          expectedDataToolFacts: [
            {
              toolName: "getMonthlyCategoryTotals",
              input: { month: "2026-06" },
              path: "$.*",
              value: { category: "衣服・美容", type: "expense", totalAmount: 12111 },
            },
            {
              toolName: "getMonthlyCategoryTotals",
              input: { month: "2026-07" },
              path: "$.*",
              value: { category: "衣服・美容", type: "expense", totalAmount: 19475 },
            },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("未根拠の chart values") });
  });

  it("rejects chart values whose point labels do not resolve to a fact month", () => {
    const juneResult = {
      toolName: "getMonthlyCategoryTotals",
      input: { month: "2026-06" },
      output: [{ category: "衣服・美容", type: "expense", totalAmount: 12111 }],
    };
    const julyResult = {
      toolName: "getMonthlyCategoryTotals",
      input: { month: "2026-07" },
      output: [{ category: "衣服・美容", type: "expense", totalAmount: 19475 }],
    };
    const chartOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "chart",
          title: "衣服・美容",
          chartType: "bar",
          href: "/0/cf/2026-07",
          series: [{ name: "衣服・美容", amountType: "expense" }],
          data: [
            { label: "現在", values: [12111] },
            { label: "以前", values: [19475] },
          ],
        },
      ],
      dataToolResults: [juneResult, julyResult],
      textEvidence: [{ text: "回答", dataToolResults: [juneResult, julyResult] }],
    });

    expect(
      assertFinanceResponse(chartOutput, {
        config: {
          allowedVisibleAmounts: [12111, 19475],
          allowedVisibleMonths: ["2026-06", "2026-07"],
          expectedDataToolFacts: [
            {
              toolName: "getMonthlyCategoryTotals",
              input: { month: "2026-06" },
              path: "$.*",
              value: { category: "衣服・美容", type: "expense", totalAmount: 12111 },
            },
            {
              toolName: "getMonthlyCategoryTotals",
              input: { month: "2026-07" },
              path: "$.*",
              value: { category: "衣服・美容", type: "expense", totalAmount: 19475 },
            },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("未根拠の chart values") });
  });

  it("rejects duplicate temporal aliases in a time-series chart", () => {
    const monthlyResults = [
      {
        toolName: "getMonthlyCategoryTotals",
        input: { month: "2026-06" },
        output: [{ category: "衣服・美容", type: "expense", totalAmount: 12111 }],
      },
      {
        toolName: "getMonthlyCategoryTotals",
        input: { month: "2026-07" },
        output: [{ category: "衣服・美容", type: "expense", totalAmount: 19475 }],
      },
    ];
    const chartOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "chart",
          title: "衣服・美容",
          chartType: "line",
          href: "/0/cf/2026-07",
          series: [{ name: "衣服・美容", amountType: "expense" }],
          data: [
            { label: "前月", values: [12111] },
            { label: "先月", values: [12111] },
          ],
        },
      ],
      dataToolResults: monthlyResults,
      textEvidence: [{ text: "回答", dataToolResults: monthlyResults }],
    });

    expect(
      assertFinanceResponse(chartOutput, {
        config: {
          allowedVisibleAmounts: [12111, 19475],
          allowedVisibleMonths: ["2026-06", "2026-07"],
          expectedDataToolFacts: [
            {
              toolName: "getMonthlyCategoryTotals",
              input: { month: "2026-06" },
              path: "$.*",
              value: { category: "衣服・美容", type: "expense", totalAmount: 12111 },
            },
            {
              toolName: "getMonthlyCategoryTotals",
              input: { month: "2026-07" },
              path: "$.*",
              value: { category: "衣服・美容", type: "expense", totalAmount: 19475 },
            },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("時系列 chart の期間重複") });
  });

  it("rejects a composition chart type for a time series", () => {
    const monthlyResults = [
      {
        toolName: "getMonthlySummaryByMonth",
        input: { month: "2026-06" },
        output: { month: "2026-06", totalExpense: 100 },
      },
      {
        toolName: "getMonthlySummaryByMonth",
        input: { month: "2026-07" },
        output: { month: "2026-07", totalExpense: 80 },
      },
    ];
    const chartOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "chart",
          title: "月別支出",
          chartType: "pie",
          href: "/0/cf/2026-07",
          series: [{ name: "支出", amountType: "expense" }],
          data: [
            { label: "2026-06", values: [100] },
            { label: "2026-07", values: [80] },
          ],
        },
      ],
      dataToolResults: monthlyResults,
      textEvidence: [{ text: "回答", dataToolResults: monthlyResults }],
    });

    expect(
      assertFinanceResponse(chartOutput, {
        config: {
          allowedVisibleAmounts: [80, 100],
          allowedVisibleMonths: ["2026-06", "2026-07"],
          expectedDataToolFacts: [
            {
              toolName: "getMonthlySummaryByMonth",
              input: { month: "2026-06" },
              path: "$.totalExpense",
              value: 100,
            },
            {
              toolName: "getMonthlySummaryByMonth",
              input: { month: "2026-07" },
              path: "$.totalExpense",
              value: 80,
            },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("時系列 chart type 不一致") });
  });

  it("rejects an unexpected route on any card", () => {
    const mixedRouteOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
        {
          type: "insight",
          title: "補足",
          description: "補足情報です。",
          action: { label: "資産を見る", href: "/0/bs" },
        },
      ],
    });

    expect(
      assertFinanceResponse(mixedRouteOutput, {
        config: { expectedRoute: "/0/cf/2026-07" },
      }),
    ).toMatchObject({
      pass: false,
      reason: expect.stringContaining(
        "route 不一致: expected=/0/cf/2026-07 actual=/0/cf/2026-07,/0/bs",
      ),
    });
  });

  it("requires the expected route on a structured card", () => {
    const fallbackRouteOutput = JSON.stringify({
      text: "詳細は /0/cf/2026-07 で確認できます。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
        },
      ],
    });

    expect(
      assertFinanceResponse(fallbackRouteOutput, {
        config: { expectedRoute: "/0/cf/2026-07" },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a card route that was not returned by the route tool", () => {
    const fabricatedRouteOutput = JSON.stringify({
      allowedHrefs: [],
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(fabricatedRouteOutput, {
        config: { expectedRoute: "/0/cf/2026-07" },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects an unexpected route rendered in card text", () => {
    const cardTextRouteOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          description: "詳細は /0/bs です。",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(cardTextRouteOutput, {
        config: { expectedRoute: "/0/cf/2026-07" },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects an unexpected route in a visible Markdown link", () => {
    const textRouteOutput = JSON.stringify({
      text: "[資産を見る](/0/bs)",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(textRouteOutput, {
        config: { expectedRoute: "/0/cf/2026-07" },
      }),
    ).toMatchObject({
      pass: false,
      reason: expect.stringContaining(
        "route 不一致: expected=/0/cf/2026-07 actual=/0/cf/2026-07,/0/bs",
      ),
    });
  });

  it("rejects an unexpected bare route in visible text", () => {
    const textRouteOutput = JSON.stringify({
      text: "資産は /0/bs で確認できます。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(textRouteOutput, {
        config: { expectedRoute: "/0/cf/2026-07" },
      }),
    ).toMatchObject({
      pass: false,
      reason: expect.stringContaining(
        "route 不一致: expected=/0/cf/2026-07 actual=/0/cf/2026-07,/0/bs",
      ),
    });
  });

  it.each(["/0/cf/2026-07?wrong=1", "/0/cf/2026-07/extra", "/0"])(
    "rejects the complete unexpected visible route: %s",
    (visibleRoute) => {
      const textRouteOutput = JSON.stringify({
        text: `詳細は ${visibleRoute} です。`,
        cards: [
          {
            type: "summary",
            title: "月次収支",
            metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
            href: "/0/cf/2026-07",
          },
        ],
      });

      expect(
        assertFinanceResponse(textRouteOutput, {
          config: { expectedRoute: "/0/cf/2026-07" },
        }),
      ).toMatchObject({ pass: false });
    },
  );

  it("requires insight facts to appear in the insight card", () => {
    const fallbackOnlyOutput = JSON.stringify({
      text: "2026-07の支出改善です。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "食費を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(fallbackOnlyOutput, {
        config: { expectedInsightFacts: ["2026-07"] },
      }),
    ).toMatchObject({
      pass: false,
      reason: "不足 insight facts: 2026-07",
    });
  });

  it("accepts a Japanese month format for an expected insight month", () => {
    const localizedMonthOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "2026年7月の衣服・美容は前月より増加しました。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(localizedMonthOutput, {
        config: { expectedInsightFacts: ["2026-07"] },
      }),
    ).toMatchObject({ pass: true });
  });

  it("accepts an unpadded numeric month for an expected insight month", () => {
    const unpaddedMonthOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "2026-7の衣服・美容を確認しました。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(unpaddedMonthOutput, {
        config: {
          allowedVisibleMonths: ["2026-07"],
          expectedInsightFacts: ["2026-07"],
          visibleMonthClaims: [{ month: "2026-07" }],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("accepts a dotted numeric month for an expected insight month", () => {
    const dottedMonthOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "2026.7の衣服・美容は前月より増加しました。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(dottedMonthOutput, {
        config: { expectedInsightFacts: ["2026-07"] },
      }),
    ).toMatchObject({ pass: true });
  });

  it("binds visible months to current and comparison roles", () => {
    const reversedMonthsOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "2026年6月の衣服・美容は前月（2026年7月）より増加しました。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(reversedMonthsOutput, {
        config: {
          allowedVisibleMonths: ["2026-06", "2026-07"],
          visibleMonthClaims: [
            { month: "2026-07" },
            { month: "2026-06", rolePattern: "(前月|先月|比較)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("accepts visible months in their expected comparison roles", () => {
    const comparisonOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "2026年7月の衣服・美容は前月（2026年6月）より増加しました。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(comparisonOutput, {
        config: {
          allowedVisibleMonths: ["2026-06", "2026-07"],
          visibleMonthClaims: [
            { month: "2026-07" },
            { month: "2026-06", rolePattern: "(前月|先月|比較)" },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("honors a preceding role marker for a standalone month", () => {
    const splitMonthOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "前月2026年6月との比較",
          description: "2026年7月の衣服・美容は前月より増加しました。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(splitMonthOutput, {
        config: {
          allowedVisibleMonths: ["2026-06", "2026-07"],
          visibleMonthClaims: [
            { month: "2026-07" },
            { month: "2026-06", rolePattern: "(前月|先月|比較)" },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("accepts a relative previous month in a configured comparison role", () => {
    const relativeComparisonOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "2026年7月の衣服・美容は前月の12,111円から19,475円に増加しました。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(relativeComparisonOutput, {
        config: {
          allowedVisibleAmounts: [12111, 19475],
          allowedVisibleMonths: ["2026-06", "2026-07"],
          visibleMonthClaims: [
            { month: "2026-07" },
            { month: "2026-06", rolePattern: "(前月|先月|比較)" },
          ],
          visibleAmountClaims: [
            { label: "衣服・美容", amount: 19475 },
            { label: "衣服・美容", amount: 12111, rolePattern: "(前月|先月|比較)" },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("recognizes a relative previous month followed by 分", () => {
    const relativeComparisonOutput = JSON.stringify({
      text: "先月分の食費は41,837円です。",
      cards: [
        {
          type: "summary",
          title: "食費",
          metrics: [{ label: "食費", amount: 41837, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(relativeComparisonOutput, {
        config: {
          allowedVisibleAmounts: [41837],
          allowedVisibleMonths: ["2026-07"],
          visibleAmountClaims: [{ label: "食費", amount: 41837 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("relative-先月") });
  });

  it("recognizes a relative previous month followed by a topic particle", () => {
    const relativeComparisonOutput = JSON.stringify({
      text: "先月は食費41,837円です。",
      cards: [
        {
          type: "summary",
          title: "食費",
          metrics: [{ label: "食費", amount: 41837, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(relativeComparisonOutput, {
        config: {
          allowedVisibleAmounts: [41837],
          allowedVisibleMonths: ["2026-07"],
          visibleAmountClaims: [{ label: "食費", amount: 41837 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("relative-先月") });
  });

  it.each(["先月、食費41,837円です。", "先月も食費41,837円です。"])(
    "recognizes a relative month across common Japanese boundaries: %s",
    (text) => {
      const relativeComparisonOutput = JSON.stringify({
        text,
        cards: [
          {
            type: "summary",
            title: "食費",
            metrics: [{ label: "食費", amount: 41837, amountType: "expense" }],
            href: "/0/cf/2026-07",
          },
        ],
      });

      expect(
        assertFinanceResponse(relativeComparisonOutput, {
          config: {
            allowedVisibleAmounts: [41837],
            allowedVisibleMonths: ["2026-07"],
            visibleAmountClaims: [{ label: "食費", amount: 41837 }],
          },
        }),
      ).toMatchObject({ pass: false, reason: expect.stringContaining("relative-先月") });
    },
  );

  it.each(["先々月", "昨々月"])("recognizes an earlier named relative month: %s", (month) => {
    const relativeComparisonOutput = JSON.stringify({
      text: `${month}の食費は41,837円です。`,
      cards: [
        {
          type: "summary",
          title: "食費",
          metrics: [{ label: "食費", amount: 41837, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(relativeComparisonOutput, {
        config: {
          allowedVisibleAmounts: [41837],
          allowedVisibleMonths: ["2026-07"],
          visibleAmountClaims: [{ label: "食費", amount: 41837 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining(`relative-${month}`) });
  });

  it("recognizes a relative month followed by a day", () => {
    const relativeDateOutput = JSON.stringify({
      text: "先月10日の支出は6,587円です。",
      cards: [
        {
          type: "summary",
          title: "7月10日の支出",
          metrics: [{ label: "支出", amount: 6587, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(relativeDateOutput, {
        config: {
          allowedVisibleAmounts: [6587],
          allowedVisibleDates: ["2026-07-10"],
          allowedVisibleMonths: ["2026-07"],
          visibleAmountClaims: [{ label: "支出", amount: 6587 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("relative-先月10日") });
  });

  it("rejects a numeric relative month outside the allowed month", () => {
    const relativeComparisonOutput = JSON.stringify({
      text: "2か月前の食費は41,837円です。",
      cards: [
        {
          type: "summary",
          title: "食費",
          metrics: [{ label: "食費", amount: 41837, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(relativeComparisonOutput, {
        config: {
          allowedVisibleAmounts: [41837],
          allowedVisibleMonths: ["2026-07"],
          visibleAmountClaims: [{ label: "食費", amount: 41837 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("relative-2か月前") });
  });

  it("validates an era-qualified month in its configured role", () => {
    const eraMonthOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description:
            "2026年7月の衣服・美容は前月より増加しました。令和8年6月の衣服・美容は19,475円です。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(eraMonthOutput, {
        config: {
          allowedVisibleAmounts: [12111, 19475],
          allowedVisibleMonths: ["2026-06", "2026-07"],
          visibleMonthClaims: [
            { month: "2026-07" },
            { month: "2026-06", rolePattern: "(前月|先月|比較)" },
          ],
          visibleAmountClaims: [
            { label: "衣服・美容", amount: 19475 },
            { label: "衣服・美容", amount: 12111, rolePattern: "(前月|先月|比較)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("validates a Gregorian month written in kanji in its configured role", () => {
    const kanjiMonthOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description:
            "2026年7月の衣服・美容は前月より増加しました。2026年六月の衣服・美容は19,475円です。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(kanjiMonthOutput, {
        config: {
          allowedVisibleAmounts: [12111, 19475],
          allowedVisibleMonths: ["2026-06", "2026-07"],
          visibleMonthClaims: [
            { month: "2026-07" },
            { month: "2026-06", rolePattern: "(前月|先月|比較)" },
          ],
          visibleAmountClaims: [
            { label: "衣服・美容", amount: 19475 },
            { label: "衣服・美容", amount: 12111, rolePattern: "(前月|先月|比較)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("validates a yearless kanji month in its configured role", () => {
    const kanjiMonthOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description:
            "2026年7月の衣服・美容は前月より増加しました。六月の衣服・美容は19,475円です。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(kanjiMonthOutput, {
        config: {
          allowedVisibleAmounts: [12111, 19475],
          allowedVisibleMonths: ["2026-06", "2026-07"],
          visibleMonthClaims: [
            { month: "2026-07" },
            { month: "2026-06", rolePattern: "(前月|先月|比較)" },
          ],
          visibleAmountClaims: [
            { label: "衣服・美容", amount: 19475 },
            { label: "衣服・美容", amount: 12111, rolePattern: "(前月|先月|比較)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("carries an amount label into an explicit current-month clause", () => {
    const currentMonthOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description:
            "衣服・美容は前月より増加しました。衣服・美容の前月（2026年6月）は12,111円、2026年7月は19,475円です。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(currentMonthOutput, {
        config: {
          allowedVisibleAmounts: [12111, 19475],
          visibleAmountClaims: [
            { label: "衣服・美容", amount: 19475 },
            { label: "衣服・美容", amount: 12111, rolePattern: "(前月|先月|比較)" },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("collects every unitless amount governed by a finance label", () => {
    const multipleAmountOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容は前月12,111、今月999,999に増加しました。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(multipleAmountOutput, {
        config: {
          allowedVisibleAmounts: [12111, 19475],
          visibleAmountClaims: [
            { label: "衣服・美容", amount: 19475 },
            { label: "衣服・美容", amount: 12111, rolePattern: "(前月|先月|比較)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("accepts a chronological comparison without assigning 比較 to one month", () => {
    const comparisonOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出比較",
          description: "2026年6月と2026年7月を比較すると、衣服・美容は前月より増加しました。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(comparisonOutput, {
        config: {
          allowedVisibleMonths: ["2026-06", "2026-07"],
          visibleMonthClaims: [
            { month: "2026-07" },
            { month: "2026-06", rolePattern: "(前月|先月|比較)" },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("accepts a chronological comparison with yearless months", () => {
    const comparisonOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "衣服・美容：6月と7月の比較",
          description: "2026年7月の衣服・美容は前月より増加しました。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(comparisonOutput, {
        config: {
          allowedVisibleMonths: ["2026-06", "2026-07"],
          visibleMonthClaims: [
            { month: "2026-07" },
            { month: "2026-06", rolePattern: "(前月|先月|比較)" },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("accepts a comparison that crosses a year boundary", () => {
    const comparisonOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "2026年12月と2027年1月の比較",
          description: "2027年1月は前月より増加しました。",
          action: { label: "内訳を見る", href: "/0/cf/2027-01" },
        },
      ],
    });

    expect(
      assertFinanceResponse(comparisonOutput, {
        config: {
          allowedVisibleMonths: ["2026-12", "2027-01"],
          visibleMonthClaims: [
            { month: "2027-01" },
            { month: "2026-12", rolePattern: "(前月|先月|比較)" },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("rejects a stale dotted snapshot date", () => {
    const staleSnapshotOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "2025.07.31時点の総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(staleSnapshotOutput, {
        config: {
          allowedVisibleDates: ["2026-07-31"],
          allowedVisibleMonths: ["2026-07"],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a stale unpadded hyphenated snapshot date", () => {
    const staleSnapshotOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "2025-7-31時点の総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(staleSnapshotOutput, {
        config: {
          allowedVisibleDates: ["2026-07-31"],
          allowedVisibleMonths: ["2026-07"],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a snapshot date qualified as last year", () => {
    const staleSnapshotOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "昨年7月31日時点の総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(staleSnapshotOutput, {
        config: {
          allowedVisibleDates: ["2026-07-31"],
          allowedVisibleMonths: ["2026-07"],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a month-only snapshot qualified as last year", () => {
    const staleSnapshotOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "昨年7月の総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(staleSnapshotOutput, {
        config: { allowedVisibleMonths: ["2026-07"] },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a snapshot date qualified as next year", () => {
    const futureSnapshotOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "来年7月31日時点の総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(futureSnapshotOutput, {
        config: {
          allowedVisibleDates: ["2026-07-31"],
          allowedVisibleMonths: ["2026-07"],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it.each(["昨日の総資産", "昨日は総資産", "昨日が総資産"])(
    "rejects a snapshot labeled as %s",
    (title) => {
      const staleSnapshotOutput = JSON.stringify({
        text: "回答",
        cards: [
          {
            type: "summary",
            title,
            metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
            href: "/0/bs",
          },
        ],
      });

      expect(
        assertFinanceResponse(staleSnapshotOutput, {
          config: { allowedVisibleDates: ["2026-07-31"] },
        }),
      ).toMatchObject({ pass: false });
    },
  );

  it("rejects a snapshot labeled with a numeric relative day", () => {
    const staleSnapshotOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "2日前の総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(staleSnapshotOutput, {
        config: { allowedVisibleDates: ["2026-07-31"] },
      }),
    ).toMatchObject({ pass: false, reason: "未許可の可視日付: relative-2日前" });
  });

  it("rejects a 分-qualified relative day in fallback text", () => {
    const relativeDateOutput = JSON.stringify({
      text: "昨日分の支出は6,587円です。",
      cards: [
        {
          type: "summary",
          title: "7月10日の支出",
          metrics: [{ label: "支出", amount: 6587, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(relativeDateOutput, {
        config: {
          allowedVisibleAmounts: [6587],
          allowedFallbackTextDates: ["2026-07-10"],
          visibleAmountClaims: [{ label: "支出", amount: 6587 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: "未許可の回答本文日付: relative-昨日" });
  });

  it("rejects a relative day followed by an additional particle", () => {
    const relativeDateOutput = JSON.stringify({
      text: "昨日も総資産は5,683,100円です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(relativeDateOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          allowedVisibleDates: ["2026-07-31"],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("relative-昨日") });
  });

  it.each(["1週間前", "先週"])("rejects a week-based relative date: %s", (period) => {
    const relativeDateOutput = JSON.stringify({
      text: `${period}の総資産は5,683,100円です。`,
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(relativeDateOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          allowedVisibleDates: ["2026-07-31"],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining(`relative-${period}`) });
  });

  it("rejects a negated expected date", () => {
    const negatedDateOutput = JSON.stringify({
      text: "対象日は7月10日ではありません。",
      cards: [
        {
          type: "summary",
          title: "7月10日の支出",
          metrics: [{ label: "支出", amount: 6587, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(negatedDateOutput, {
        config: {
          allowedVisibleDates: ["2026-07-10"],
          allowedVisibleMonths: ["2026-07"],
        },
      }),
    ).toMatchObject({ pass: false, reason: "否定された可視日付・月: 7月10日" });
  });

  it("rejects a snapshot labeled as tomorrow", () => {
    const futureSnapshotOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "明日時点の総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(futureSnapshotOutput, {
        config: { allowedVisibleDates: ["2026-07-31"] },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a stale yearless hyphenated snapshot date", () => {
    const staleSnapshotOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "7-30時点の総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(staleSnapshotOutput, {
        config: { allowedVisibleDates: ["2026-07-31"] },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a stale yearless dotted snapshot date", () => {
    const staleSnapshotOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "7.30時点の総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(staleSnapshotOutput, {
        config: { allowedVisibleDates: ["2026-07-31"] },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a kanji-written stale snapshot date", () => {
    const staleSnapshotOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "七月三十日時点の総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(staleSnapshotOutput, {
        config: {
          allowedVisibleDates: ["2026-07-31"],
          allowedVisibleMonths: ["2026-07"],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("preserves a future qualifier on a kanji-written snapshot date", () => {
    const futureSnapshotOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "来年七月三十一日時点の総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(futureSnapshotOutput, {
        config: {
          allowedVisibleDates: ["2026-07-31"],
          allowedVisibleMonths: ["2026-07"],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects relative-month snapshot headings", () => {
    const relativeMonthOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "来月末時点の総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(relativeMonthOutput, {
        config: { allowedVisibleMonths: ["2026-07"] },
      }),
    ).toMatchObject({ pass: false, reason: "未許可の可視月: relative-来月" });
  });

  it("maps explicit month-start and month-end snapshot headings to concrete dates", () => {
    const createSnapshotOutput = (boundary: "初" | "末") =>
      JSON.stringify({
        text: "回答",
        cards: [
          {
            type: "summary",
            title: `2026年7月${boundary}時点の総資産`,
            metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
            href: "/0/bs",
          },
        ],
      });
    const context = {
      config: {
        allowedVisibleDates: ["2026-07-31"],
        allowedVisibleMonths: ["2026-07"],
      },
    };

    expect(assertFinanceResponse(createSnapshotOutput("初"), context)).toMatchObject({
      pass: false,
      reason: expect.stringContaining("2026-07-01"),
    });
    expect(assertFinanceResponse(createSnapshotOutput("末"), context)).toMatchObject({
      pass: true,
    });
  });

  it("maps a yearless month boundary to a concrete wildcard date", () => {
    const boundaryOutput = JSON.stringify({
      text: "7月初時点の総資産は5,683,100円です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(boundaryOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          allowedVisibleDates: ["2026-07-31"],
          allowedVisibleMonths: ["2026-07"],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("*-07-01") });
  });

  it("rejects a standalone relative-year claim", () => {
    const relativeYearOutput = JSON.stringify({
      text: "去年の総資産は5,683,100円です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(relativeYearOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          allowedVisibleMonths: ["2026-07"],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("relative-去年") });
  });

  it.each([
    ["2025年", "year-2025"],
    ["2025年度", "year-2025"],
    ["令和7年", "year-2025"],
  ])("rejects a standalone absolute-year claim: %s", (year, expectedYear) => {
    const absoluteYearOutput = JSON.stringify({
      text: `${year}の総資産は5,683,100円です。`,
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(absoluteYearOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          allowedVisibleMonths: ["2026-07"],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining(expectedYear) });
  });

  it.each(["2026年", "令和8年"])("rejects a denial of an expected standalone year: %s", (year) => {
    const negatedYearOutput = JSON.stringify({
      text: `対象年は${year}ではありません。総資産は5,683,100円です。`,
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(negatedYearOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          allowedVisibleMonths: ["2026-07"],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("否定された可視日付・月") });
  });

  it.each([
    ["2026年初", "2026-01-01"],
    ["2026年末", "2026-12-31"],
    ["令和8年末", "2026-12-31"],
    ["2026年度初", "2026-04-01"],
    ["2026年度末", "2027-03-31"],
    ["令和8年度末", "2027-03-31"],
  ])("maps a year boundary to a concrete date: %s", (boundary, expectedDate) => {
    const boundaryOutput = JSON.stringify({
      text: `${boundary}時点の総資産は5,683,100円です。`,
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(boundaryOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          allowedVisibleDates: ["2026-07-31"],
          allowedVisibleMonths: ["2026-07"],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining(expectedDate) });
  });

  it("requires action facts in the visible action label", () => {
    const unrelatedActionOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "action",
          title: "7月10日の支出",
          description: "対象日の明細です",
          action: { label: "負債を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(unrelatedActionOutput, {
        config: {
          expectedCardActionFacts: [
            {
              cardType: "action",
              pattern: "(?=.*(2026[-/]07[-/]10|7月10日|7/10))(?=.*(支出|明細|内訳))",
            },
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("converts a Japanese era snapshot date before validation", () => {
    const staleSnapshotOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "令和7年7月31日時点の総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(staleSnapshotOutput, {
        config: {
          allowedVisibleDates: ["2026-07-31"],
          allowedVisibleMonths: ["2026-07"],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("preserves an era year on a kanji-written snapshot date", () => {
    const staleSnapshotOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "令和九年七月三十一日時点の総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(staleSnapshotOutput, {
        config: {
          allowedVisibleDates: ["2026-07-31"],
          allowedVisibleMonths: ["2026-07"],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("preserves an all-kanji Gregorian year on a snapshot date", () => {
    const staleSnapshotOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "二〇二七年七月三十一日時点の総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(staleSnapshotOutput, {
        config: {
          allowedVisibleDates: ["2026-07-31"],
          allowedVisibleMonths: ["2026-07"],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("preserves a unit-style kanji Gregorian year on a snapshot date", () => {
    const staleSnapshotOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "二千二十七年七月三十一日時点の総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(staleSnapshotOutput, {
        config: {
          allowedVisibleDates: ["2026-07-31"],
          allowedVisibleMonths: ["2026-07"],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("requires insight patterns to appear in the description", () => {
    const fallbackOnlyOutput = JSON.stringify({
      text: "食費は前月より高いため見直せそうです。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "支出を見直しましょう。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(fallbackOnlyOutput, {
        config: { requiredInsightPatterns: ["食費", "前月", "ため"] },
      }),
    ).toMatchObject({ pass: false });
  });

  it("accepts carrying a monthly surplus forward as an actionable next step", () => {
    const carryForwardOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "黒字の活用",
          description: "黒字分は来月へ繰り越しましょう。",
          action: { label: "月次収支を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(carryForwardOutput, {
        config: {
          requiredInsightPatterns: [
            "(黒字|プラス|余剰|手残り)",
            "(貯蓄|積立|予算|見直し|確保|繰り越|繰越|持ち越|(?:翌月|来月).{0,8}(回す|充て|繰り))",
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("binds a spending comparison direction to its category", () => {
    const reversedDirectionOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "2026-07の食費は前月より高いため見直します。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(reversedDirectionOutput, {
        config: {
          requiredInsightPatterns: ["(衣服・美容.{0,40}(前月|先月).{0,20}(高い|増加|上回))"],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("does not satisfy a heading fact with a metric label", () => {
    const misleadingHeadingOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "総負債",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(misleadingHeadingOutput, {
        config: {
          expectedCardHeadingFacts: [{ cardType: "summary", pattern: "総資産" }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("does not satisfy a title fact with the card description", () => {
    const misleadingTitleOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "食費を見直す",
          description: "衣服・美容が前月より増加しました。",
          action: { label: "衣服・美容の内訳", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(misleadingTitleOutput, {
        config: {
          expectedCardTitleFacts: [{ cardType: "insight", pattern: "衣服・美容" }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a displayed month that contradicts the monthly fixture", () => {
    const wrongMonthOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "2026-06月次収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    const result = assertFinanceResponse(wrongMonthOutput, {
      config: {
        allowedVisibleMonths: ["2026-07"],
        expectedCardTextFacts: [{ cardType: "summary", pattern: "(2026[-/]07|2026年7月|7月)" }],
      },
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("未許可の可視月: 2026-06");
  });

  it("recognizes a conflicting yearless visible month", () => {
    const wrongMonthOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "6月の月次収支（7月データ）",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(wrongMonthOutput, {
        config: { allowedVisibleMonths: ["2026-07"] },
      }),
    ).toMatchObject({ pass: false, reason: "未許可の可視月: *-06" });
  });

  it("rejects a contradictory visible deficit claim", () => {
    const deficitOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "2026年7月の収支",
          description: "今月は赤字です。",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(deficitOutput, {
        config: { forbiddenVisiblePatterns: ["(赤字|収支.{0,10}マイナス)"] },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects an unsupported total-assets trend from a single snapshot", () => {
    const snapshotResult = {
      toolName: "getLatestTotalAssets",
      output: 5683100,
    };
    const trendOutput = JSON.stringify({
      allowedHrefs: ["/0/bs"],
      dataToolResults: [snapshotResult],
      text: "2026年7月31日の総資産は5,683,100円です。以前より増えています。",
      textEvidence: [
        {
          text: "2026年7月31日の総資産は5,683,100円です。以前より増えています。",
          allowedHrefs: ["/0/bs"],
          dataToolResults: [snapshotResult],
        },
      ],
      cards: [
        {
          type: "summary",
          title: "総資産",
          description: "2026年7月31日",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(trendOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          allowedVisibleDates: ["2026-07-31"],
          allowedVisibleMonths: ["2026-07"],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
          expectedDataToolFacts: [{ toolName: "getLatestTotalAssets", path: "$", value: 5683100 }],
          forbiddenVisiblePatterns: [
            "(総資産|保有資産|資産).{0,32}(増えています|増えました|減っています|減りました|増加(?:しています|しました|傾向(?:です|にあります))|減少(?:しています|しました|傾向(?:です|にあります))|上昇(?:しています|しました|傾向(?:です|にあります))|低下(?:しています|しました|傾向(?:です|にあります))|改善(?:しています|しました)|悪化(?:しています|しました)|上回っています|下回っています)",
            "(以前|過去|前回|前月|先月|前年|比較).{0,24}(増えています|増えました|減っています|減りました|増加(?:しています|しました|傾向(?:です|にあります))|減少(?:しています|しました|傾向(?:です|にあります))|上昇(?:しています|しました|傾向(?:です|にあります))|低下(?:しています|しました|傾向(?:です|にあります))|改善(?:しています|しました)|悪化(?:しています|しました)|上回っています|下回っています)",
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("禁止された可視表現") });
  });

  it("accepts an explicit total-assets trend uncertainty from a single snapshot", () => {
    const uncertaintyOutput = JSON.stringify({
      text: "前月との比較データがないため、総資産の増減は判断できません。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          description: "比較データなし",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(uncertaintyOutput, {
        config: {
          forbiddenVisiblePatterns: [
            "(総資産|保有資産|資産).{0,32}(増えています|増えました|減っています|減りました|増加(?:しています|しました|傾向(?:です|にあります))|減少(?:しています|しました|傾向(?:です|にあります))|上昇(?:しています|しました|傾向(?:です|にあります))|低下(?:しています|しました|傾向(?:です|にあります))|改善(?:しています|しました)|悪化(?:しています|しました)|上回っています|下回っています)",
            "(以前|過去|前回|前月|先月|前年|比較).{0,24}(増えています|増えました|減っています|減りました|増加(?:しています|しました|傾向(?:です|にあります))|減少(?:しています|しました|傾向(?:です|にあります))|上昇(?:しています|しました|傾向(?:です|にあります))|低下(?:しています|しました|傾向(?:です|にあります))|改善(?:しています|しました)|悪化(?:しています|しました)|上回っています|下回っています)",
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("rejects an unsupported affirmative asset-trend variant", () => {
    const trendOutput = JSON.stringify({
      text: "総資産は以前より増加傾向にあります。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(trendOutput, {
        config: {
          forbiddenVisiblePatterns: [
            "(総資産|保有資産|資産).{0,32}(増加(?:しています|しました|傾向(?:です|にあります)))",
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("禁止された可視表現") });
  });

  it("rejects a historical asset extreme from a single snapshot", () => {
    const extremeOutput = JSON.stringify({
      text: "総資産は過去最高です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(extremeOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          forbiddenVisiblePatterns: ["(総資産|保有資産|資産).{0,16}(過去|史上)(?:最高|最低)"],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("禁止された可視表現") });
  });

  it("rejects an unsupported affirmative liability claim from an asset scalar", () => {
    const liabilityOutput = JSON.stringify({
      text: "総資産は5,683,100円で、負債があります。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(liabilityOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          forbiddenVisiblePatterns: [
            "(総負債|負債|借入|ローン)(?:は|が)?.{0,6}(あります|ある|存在しています|残っています)(?![^。！？\\n]{0,16}(とは限|とは言え|確認でき|不明))",
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("禁止された可視表現") });
  });

  it("rejects an unsupported asset-composition claim from a scalar snapshot", () => {
    const compositionOutput = JSON.stringify({
      text: "総資産はすべて現金です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(compositionOutput, {
        config: {
          forbiddenVisiblePatterns: [
            "(総資産|保有資産|資産).{0,20}(すべて|全て|全部|全額|のみ|だけ).{0,8}(現金|預金|株式|投資信託|暗号資産|仮想通貨|債券|保険|不動産)(?![^。！？\\n]{0,16}(とは限|とは言え|断定でき|判断でき|不明))",
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("禁止された可視表現") });
  });

  it("accepts explicit uncertainty about asset composition from a scalar snapshot", () => {
    const compositionOutput = JSON.stringify({
      text: "総資産がすべて現金とは限りません。",
      cards: JSON.parse(output).cards,
    });

    expect(
      assertFinanceResponse(compositionOutput, {
        config: {
          forbiddenVisiblePatterns: [
            "(総資産|保有資産|資産).{0,20}(すべて|全て|全部|全額|のみ|だけ).{0,8}(現金|預金|株式|投資信託|暗号資産|仮想通貨|債券|保険|不動産)(?![^。！？\\n]{0,16}(とは限|とは言え|断定でき|判断でき|不明))",
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it.each([
    ["総資産には不動産が含まれています。", false],
    ["総資産には不動産もあります。", false],
    ["総資産は不動産を保有しています。", false],
    ["総資産に不動産が含まれているとは限りません。", true],
  ])("validates an asset-category presence claim from a scalar snapshot: %s", (text, pass) => {
    const compositionOutput = JSON.stringify({ text, cards: JSON.parse(output).cards });

    expect(
      assertFinanceResponse(compositionOutput, {
        config: {
          forbiddenVisiblePatterns: [
            "((総資産|保有資産|資産)(?:には|に|は|が).{0,12}(現金|預金|株式|投資信託|暗号資産|仮想通貨|債券|保険|不動産)(?:(?:が|も)?(?:含まれています|含まれます|含まれている|あります|保有されています)|を保有しています)|(現金|預金|株式|投資信託|暗号資産|仮想通貨|債券|保険|不動産)(?:が|は).{0,12}(総資産|保有資産|資産)(?:に|へ)(含まれています|含まれます|含まれている|あります))(?![^。！？\\n]{0,16}(とは限|とは言え|断定でき|判断でき|不明))",
          ],
        },
      }),
    ).toMatchObject({ pass });
  });

  it("rejects an unsupported majority asset-composition claim from a scalar snapshot", () => {
    const compositionOutput = JSON.stringify({
      text: "総資産の大半は現金です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(compositionOutput, {
        config: {
          forbiddenVisiblePatterns: [
            "(総資産|保有資産|資産).{0,20}(大半|過半|半分以上|主に|中心|多く).{0,8}(現金|預金|株式|投資信託|暗号資産|仮想通貨|債券|保険|不動産)",
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("禁止された可視表現") });
  });

  it.each([
    [
      "現金が多めです。",
      "(現金|預金|株式|投資信託|暗号資産|仮想通貨|債券|保険|不動産)(?:が|は).{0,8}(多め|少なめ|中心|主体|主要|最大|最小|多い|少ない)",
    ],
    [
      "資産構成は現金中心です。",
      "(資産構成|ポートフォリオ).{0,16}(現金|預金|株式|投資信託|暗号資産|仮想通貨|債券|保険|不動産).{0,8}(中心|主体|主要|多め|少なめ|多い|少ない)",
    ],
    [
      "総資産は以前より伸びています。",
      "(総資産|保有資産|資産).{0,32}(伸びています|伸びました|伸長しています|伸長しました)",
    ],
    [
      "最大の資産カテゴリは不動産です。",
      "((最大|最小|最多|最少|一番(?:多い|少ない|大きい|小さい)).{0,12}(資産|カテゴリ)|(資産|カテゴリ).{0,12}(最大|最小|最多|最少|一番(?:多い|少ない|大きい|小さい))).{0,12}(現金|預金|株式|投資信託|暗号資産|仮想通貨|債券|保険|不動産)",
    ],
  ])("rejects another unsupported scalar asset claim: %s", (text, pattern) => {
    expect(
      assertFinanceResponse(
        JSON.stringify({
          text,
          cards: [
            {
              type: "summary",
              title: "総資産",
              metrics: [{ label: "総資産", amount: 5683100, amountType: "balance" }],
              href: "/0/bs",
            },
          ],
        }),
        { config: { forbiddenVisiblePatterns: [pattern] } },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("禁止された可視表現") });
  });

  it("rejects a reversed qualitative food-spending trend", () => {
    const trendOutput = JSON.stringify({
      text: "食費も前月より増加しました。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容は前月より増加したため見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(trendOutput, {
        config: {
          forbiddenVisiblePatterns: [
            "((食費).{0,30}(前月|先月).{0,20}|(前月|先月).{0,20}(食費).{0,20})(増加|上回)(?!\\s*.{0,10}(していない|していません|ではなく|ではない|ではありません|でない|わけではない|訳ではない))",
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("禁止された可視表現") });
  });

  it("rejects denial of a required spending-improvement candidate", () => {
    const denialOutput = JSON.stringify({
      text: "削れそうな支出はありません。",
      cards: [
        {
          type: "insight",
          title: "衣服・美容の支出改善",
          description: "衣服・美容は前月より高いため見直せそうです。",
          action: { label: "衣服・美容の内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(denialOutput, {
        config: {
          forbiddenVisiblePatterns: [
            "(削れそうな支出|改善候補|見直し候補).{0,10}(ありません|ない|なし)",
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a negated monthly savings recommendation", () => {
    const denialOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "黒字の家計",
          description: "黒字ですが、貯蓄や予算の見直しは不要です。",
          action: { label: "家計の詳細を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(denialOutput, {
        config: {
          forbiddenVisiblePatterns: [
            "(貯蓄|積立|予算|見直し).{0,12}(不要|必要ありません|必要ない|しなくてよい|しなくてもよい)",
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("allows a noun-qualified denial of the opposite spending direction", () => {
    const denialOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "衣服・美容の支出改善",
          description: "衣服・美容は前月より減少傾向ではなく、増加しているため見直します。",
          action: { label: "衣服・美容の内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(denialOutput, {
        config: {
          forbiddenVisiblePatterns: [
            "((衣服・美容|衣服).{0,30}(前月|先月).{0,20}|(前月|先月).{0,20}(衣服・美容|衣服).{0,20})(減少|下回)(?!\\s*.{0,10}(していない|していません|ではなく|ではない|ではありません|でない|わけではない|訳ではない))",
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("allows an explicitly negated deficit claim", () => {
    const surplusOutput = JSON.stringify({
      text: "赤字ではなく、93,341円の黒字です。",
      cards: [
        {
          type: "summary",
          title: "2026年7月の収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(surplusOutput, {
        config: {
          allowedVisibleAmounts: [93341],
          forbiddenVisiblePatterns: [
            "(赤字(?!\\s*(では|じゃ)(なく|ない|ありません))|収支.{0,10}(マイナス|負)|マイナス.{0,10}収支)",
          ],
          visibleAmountClaims: [
            { label: "収支", amount: 93341 },
            { label: "黒字", amount: 93341 },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("allows a future-period surplus disclaimer", () => {
    const cautiousOutput = JSON.stringify({
      text: "7月は93,341円の黒字です。来月も黒字になるとは限りません。",
      cards: [
        {
          type: "summary",
          title: "2026年7月の収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(cautiousOutput, {
        config: {
          allowedVisibleAmounts: [93341],
          forbiddenVisiblePatterns: [
            "(黒字|プラス|余剰|手残り)(とは言えません|とは限りません|ではない|でない|ではありません)",
          ],
          visibleAmountClaims: [
            { label: "収支", amount: 93341 },
            { label: "黒字", amount: 93341 },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it.each([
    "今月は黒字ではありませんが、貯蓄を見直します。",
    "衣服・美容は前月より増加していないため、見直し対象外です。",
  ])("rejects a negated qualitative claim: %s", (description) => {
    const negatedOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "分析",
          description,
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(negatedOutput, {
        config: {
          forbiddenVisiblePatterns: [
            "(黒字|プラス).{0,8}(ではない|ありません|ない)",
            "(増加|上回).{0,8}(していない|ありません|ない|対象外)",
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("does not bind a later cautious statement to an affirmed increase", () => {
    const cautiousOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "衣服・美容の支出改善",
          description:
            "2026年7月の衣服・美容は前月より増加しましたが、高すぎるとは言えません。見直します。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(cautiousOutput, {
        config: {
          forbiddenVisiblePatterns: [
            "(増加|上回|高い|多い)(していない|していません|とは限りません|とは言えません|とは認められません|[がは]?確認できません|ではない|でない|ではありません|対象外)",
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("rejects conflicting visible dates outside transaction rows", () => {
    const conflictingDateOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "2026-07-11の支出",
          metrics: [{ label: "支出", amount: 3435, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
        {
          type: "transactionList",
          title: "2026-07-10の明細",
          transactions: [
            {
              id: "tx-a",
              date: "2026-07-10",
              description: "店舗 A",
              amount: 3435,
              amountType: "expense",
            },
          ],
        },
      ],
    });

    const result = assertFinanceResponse(conflictingDateOutput, {
      config: {
        allowedVisibleDates: ["2026-07-10"],
        expectedCardTextFacts: [
          { cardType: "summary", pattern: "(2026-07-10|7月10日)" },
          { cardType: "transactionList", pattern: "(2026-07-10|7月10日)" },
        ],
      },
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("未許可の可視日付: 2026-07-11");
    expect(result.reason).toContain("不足 card text facts");
  });

  it("allows truthful start and end dates for a monthly range", () => {
    const rangeOutput = JSON.stringify({
      text: "集計期間は2026年7月1日から7月31日です。",
      cards: [
        {
          type: "summary",
          title: "2026年7月の収支",
          metrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(rangeOutput, {
        config: { allowedVisibleDates: ["2026-07-01", "2026-07-31"] },
      }),
    ).toMatchObject({ pass: true });
  });

  it("recognizes conflicting slash-form visible dates", () => {
    const slashDateOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "7/11集計（対象7月10日）",
          metrics: [{ label: "支出", amount: 3435, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(slashDateOutput, {
        config: {
          allowedVisibleDates: ["2026-07-10"],
          expectedCardTextFacts: [
            { cardType: "summary", pattern: "(2026[-/]07[-/]10|7月10日|7/10)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: "未許可の可視日付: *-07-11" });
  });

  it("rejects an unsupported visible percentage claim", () => {
    const percentageOutput = JSON.stringify({
      text: "貯蓄率は99%です。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    const result = assertFinanceResponse(percentageOutput, {
      config: {
        allowedVisiblePercentages: [29.8],
        visiblePercentageClaims: [{ label: "貯蓄率", amount: 29.8 }],
      },
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("未許可の可視割合: 99");
  });

  it("recognizes full-width percentage signs", () => {
    const percentageOutput = JSON.stringify({
      text: "貯蓄率は99％です。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(percentageOutput, {
        config: {
          allowedVisiblePercentages: [29.8],
          visiblePercentageClaims: [{ label: "貯蓄率", amount: 29.8 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it.each(["貯蓄率は9割です。", "貯蓄率は99パーセントです。", "貯蓄率は九割です。"])(
    "recognizes a written percentage unit in %s",
    (text) => {
      const percentageOutput = JSON.stringify({
        text,
        cards: [
          {
            type: "insight",
            title: "支出改善",
            description: "衣服・美容を見直せそうです。",
            action: { label: "内訳を見る", href: "/0/cf/2026-07" },
          },
        ],
      });

      expect(
        assertFinanceResponse(percentageOutput, {
          config: {
            allowedVisiblePercentages: [29.8],
            visiblePercentageClaims: [{ label: "貯蓄率", amount: 29.8 }],
          },
        }),
      ).toMatchObject({ pass: false });
    },
  );

  it("converts compound 割分厘 notation to a percentage", () => {
    const percentageOutput = JSON.stringify({
      text: "貯蓄率は2割9分8厘です。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(percentageOutput, {
        config: {
          allowedVisiblePercentages: [29.8],
          visiblePercentageClaims: [{ label: "貯蓄率", amount: 29.8 }],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("converts kanji compound 割分厘 notation to a percentage", () => {
    const percentageOutput = JSON.stringify({
      text: "貯蓄率は二割九分八厘です。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(percentageOutput, {
        config: {
          allowedVisiblePercentages: [29.8],
          visiblePercentageClaims: [{ label: "貯蓄率", amount: 29.8 }],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("treats a triangle-prefixed percentage as negative", () => {
    const percentageOutput = JSON.stringify({
      text: "現在の貯蓄率は▲29.8%です。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(percentageOutput, {
        config: {
          allowedVisiblePercentages: [29.8],
          visiblePercentageClaims: [{ label: "貯蓄率", amount: 29.8 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("treats a マイナス-prefixed percentage as negative", () => {
    const percentageOutput = JSON.stringify({
      text: "貯蓄率はマイナス29.8%です。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(percentageOutput, {
        config: {
          allowedVisiblePercentages: [29.8],
          visiblePercentageClaims: [{ label: "貯蓄率", amount: 29.8 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it.each([
    ["3割強", false],
    ["3割弱", true],
  ])("validates the strength-qualified percentage %s", (percentage, pass) => {
    const percentageOutput = JSON.stringify({
      text: `貯蓄率は${percentage}です。`,
      cards: [
        {
          type: "insight",
          title: "家計状況",
          description: "貯蓄率を確認します。",
          action: { label: "詳細を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(percentageOutput, {
        config: {
          allowedVisiblePercentages: [29.8, 30],
          visiblePercentageClaims: [
            { label: "貯蓄率", amount: 29.8 },
            { label: "貯蓄率", amount: 30 },
          ],
        },
      }),
    ).toMatchObject({ pass });
  });

  it("rejects swapped current and comparison-period percentages", () => {
    const swappedPercentageOutput = JSON.stringify({
      text: "前月の貯蓄率は29.8%、今月の貯蓄率は64%です。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(swappedPercentageOutput, {
        config: {
          allowedVisiblePercentages: [29.8, 64],
          visiblePercentageClaims: [
            { label: "貯蓄率", amount: 29.8 },
            { label: "貯蓄率", amount: 64, rolePattern: "(前月|先月|比較)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("carries a percentage subject across comparison clauses", () => {
    const comparisonOutput = JSON.stringify({
      text: "貯蓄率は29.8%、前月は64%です。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(comparisonOutput, {
        config: {
          allowedVisiblePercentages: [29.8, 64],
          visiblePercentageClaims: [
            { label: "貯蓄率", amount: 29.8 },
            { label: "貯蓄率", amount: 64, rolePattern: "(前月|先月|比較)" },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("rejects a percentage delta as a configured percentage level", () => {
    const directionalOutput = JSON.stringify({
      text: "黒字ですが、貯蓄率は29.8%減のため貯蓄を見直します。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(directionalOutput, {
        config: {
          allowedVisiblePercentages: [29.8],
          visiblePercentageClaims: [{ label: "貯蓄率", amount: 29.8 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it.each(["から", "より"])(
    "rejects a percentage %s-direction as a configured level",
    (particle) => {
      const directionalOutput = JSON.stringify({
        text: `貯蓄率は29.8%${particle}減少しました。`,
        cards: [
          {
            type: "insight",
            title: "家計状況",
            description: "貯蓄率を確認します。",
            action: { label: "詳細を見る", href: "/0/cf/2026-07" },
          },
        ],
      });

      expect(
        assertFinanceResponse(directionalOutput, {
          config: {
            allowedVisiblePercentages: [29.8],
            visiblePercentageClaims: [{ label: "貯蓄率", amount: 29.8 }],
          },
        }),
      ).toMatchObject({ pass: false });
    },
  );

  it("validates a directional percentage-point claim", () => {
    const pointOutput = JSON.stringify({
      text: "貯蓄率は前月から99ポイント上昇しました。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "貯蓄を見直します。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(pointOutput, {
        config: {
          allowedVisiblePercentages: [29.8],
          visiblePercentageClaims: [{ label: "貯蓄率", amount: 29.8 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a percentage-point change as a configured rate level", () => {
    const pointOutput = JSON.stringify({
      text: "貯蓄率の上昇幅は29.8ポイントです。",
      cards: [
        {
          type: "insight",
          title: "家計状況",
          description: "貯蓄率を確認します。",
          action: { label: "詳細を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(pointOutput, {
        config: {
          allowedVisiblePercentages: [29.8],
          visiblePercentageClaims: [{ label: "貯蓄率", amount: 29.8 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("貯蓄率=29.8") });
  });

  it("validates a comparison-qualified percentage-point claim", () => {
    const pointOutput = JSON.stringify({
      text: "貯蓄率は前月比99ポイントです。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "貯蓄を見直します。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(pointOutput, {
        config: {
          allowedVisiblePercentages: [29.8],
          visiblePercentageClaims: [{ label: "貯蓄率", amount: 29.8 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("allows a grounded savings-rate point change", () => {
    const pointOutput = JSON.stringify({
      text: "貯蓄率は前月から34.68ポイント低下しました。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "貯蓄を見直します。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(pointOutput, {
        config: {
          allowedVisiblePercentages: [29.8, 34.68, 64.48],
          visiblePercentageClaims: [
            { label: "貯蓄率", amount: 29.8 },
            { label: "貯蓄率", amount: 64.48, rolePattern: "(前月|先月|比較)" },
            {
              label: "貯蓄率",
              amount: 34.68,
              rolePattern: "(低下|減少|下落)",
            },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("classifies a particle-qualified point change as a delta", () => {
    const pointOutput = JSON.stringify({
      text: "貯蓄率は30ポイントの上昇です。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "貯蓄を見直します。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(pointOutput, {
        config: {
          allowedVisiblePercentages: [30, 64.48],
          visiblePercentageClaims: [
            { label: "貯蓄率", amount: 30 },
            { label: "貯蓄率", amount: 64.48, rolePattern: "(前月|先月|比較)" },
            { label: "貯蓄率", amount: 34.68, rolePattern: "(低下|減少|下落)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a savings-rate point change in the opposite direction", () => {
    const pointOutput = JSON.stringify({
      text: "貯蓄率は前月から34.68ポイント上昇しました。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "貯蓄を見直します。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(pointOutput, {
        config: {
          allowedVisiblePercentages: [29.8, 34.68, 64.48],
          visiblePercentageClaims: [
            { label: "貯蓄率", amount: 29.8 },
            { label: "貯蓄率", amount: 64.48, rolePattern: "(前月|先月|比較)" },
            { label: "貯蓄率", amount: 34.68, rolePattern: "(低下|減少|下落)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a negated percentage-point direction marker", () => {
    const contradictedDirectionOutput = JSON.stringify({
      text: "貯蓄率は34.68ポイント低下ではなく上昇しました。",
      cards: [
        {
          type: "insight",
          title: "家計状況",
          description: "貯蓄率を確認します。",
          action: { label: "詳細を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(contradictedDirectionOutput, {
        config: {
          allowedVisiblePercentages: [34.68],
          visiblePercentageClaims: [
            { label: "貯蓄率", amount: 34.68, rolePattern: "(低下|減少|下落)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("否定") });
  });

  it("validates a word-based fractional percentage claim", () => {
    const fractionOutput = JSON.stringify({
      text: "貯蓄率は半分です。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "貯蓄を見直します。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(fractionOutput, {
        config: {
          allowedVisiblePercentages: [29.8, 30],
          visiblePercentageClaims: [{ label: "貯蓄率", amount: 29.8 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects a negated allowlisted percentage claim", () => {
    const negatedOutput = JSON.stringify({
      text: "貯蓄率は29.8%ではありません。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "貯蓄を見直します。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(negatedOutput, {
        config: {
          allowedVisiblePercentages: [29.8],
          visiblePercentageClaims: [{ label: "貯蓄率", amount: 29.8 }],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("rejects an allowlisted percentage whose configured label is negated before the value", () => {
    const negatedOutput = JSON.stringify({
      text: "貯蓄率ではなく税率は29.8%です。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "貯蓄率", amount: 29.8, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(negatedOutput, {
        config: {
          allowedVisiblePercentages: [29.8],
          visiblePercentageClaims: [{ label: "貯蓄率", amount: 29.8 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: "誤ラベルの可視割合: 貯蓄率=29.8(否定)" });
  });

  it("prefers an intervening unconfigured percentage label", () => {
    const mislabeledOutput = JSON.stringify({
      text: "貯蓄率と比べ税率は29.8%です。",
      cards: [
        {
          type: "summary",
          title: "月次収支",
          metrics: [{ label: "貯蓄率", amount: 29.8, amountType: "balance" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(mislabeledOutput, {
        config: {
          allowedVisiblePercentages: [29.8],
          visiblePercentageClaims: [{ label: "貯蓄率", amount: 29.8 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("税率=29.8") });
  });

  it("rejects a category percentage attributed to the wrong denominator", () => {
    const wrongBasisOutput = JSON.stringify({
      text: "食費は収入の19.03%です。",
      cards: [
        {
          type: "summary",
          title: "食費",
          metrics: [{ label: "食費", amount: 41837, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(wrongBasisOutput, {
        config: {
          allowedVisiblePercentages: [19.03],
          visiblePercentageClaims: [
            { label: "食費", amount: 19.03, basisPattern: "(支出|出費|総支出)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: "誤ラベルの可視割合: 食費=19.03(分母:収入)" });
  });

  it.each(["収入はありません", "支出はありません"])(
    "rejects a denial of a nonzero monthly total: %s",
    (denial) => {
      const denialOutput = JSON.stringify({
        text: `${denial}。黒字なので貯蓄を確保できます。`,
        cards: [
          {
            type: "summary",
            title: "月次収支",
            metrics: [
              { label: "収入", amount: 313235, amountType: "income" },
              { label: "支出", amount: 219894, amountType: "expense" },
              { label: "収支", amount: 93341, amountType: "balance" },
            ],
            href: "/0/cf/2026-07",
          },
        ],
      });

      expect(
        assertFinanceResponse(denialOutput, {
          config: {
            forbiddenVisiblePatterns: [
              "(収入|所得)(は|が)?(ありません|ございません|ない|発生していません)",
              "(支出|出費)(は|が)?(ありません|ございません|ない|発生していません)",
            ],
          },
        }),
      ).toMatchObject({ pass: false });
    },
  );

  it("accepts a percentage delta with a directional claim", () => {
    const directionalOutput = JSON.stringify({
      text: "貯蓄率は29.8%減です。",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容を見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(directionalOutput, {
        config: {
          allowedVisiblePercentages: [29.8],
          visiblePercentageClaims: [
            { label: "貯蓄率", amount: 29.8, rolePattern: "(増|減|上昇|低下)" },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  it("rejects undeclared insight amounts and generic actions", () => {
    const insightOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "2026-07は食費が前月より高いため見直せそうです。",
          amount: 999999999,
          amountLabel: "削減候補",
          amountType: "balance",
          action: { label: "詳細を確認", href: "/0/cf/2026-07" },
        },
      ],
    });

    const result = assertFinanceResponse(insightOutput, {
      config: {
        allowedInsightMetrics: [],
        expectedInsightActionPattern: "(内訳|支出|食費)",
      },
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("insight metrics 不一致");
    expect(result.reason).toContain("insight action 不一致");
  });

  it("requires an insight action when an action pattern is configured", () => {
    const emptyOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "empty",
          title: "該当データなし",
          description: "条件を変えて確認してください。",
          prompts: ["今月の支出を確認"],
        },
      ],
    });

    expect(
      assertFinanceResponse(emptyOutput, {
        config: { expectedInsightActionPattern: "内訳" },
      }),
    ).toMatchObject({ pass: false, reason: "insight action 不一致: 内訳" });
  });

  it("rejects an insight label that asserts a reducible amount", () => {
    const insightOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "衣服・美容の支出改善",
          description: "衣服・美容は前月より増加したため見直せそうです。",
          amount: 19475,
          amountLabel: "衣服・美容の削減可能額",
          amountType: "balance",
          action: { label: "衣服・美容の内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(insightOutput, {
        config: {
          allowedInsightMetrics: [
            {
              amount: 19475,
              amountType: "balance",
              labelPattern: "(?=.*(衣服・美容|衣服))(?=.*(候補|見直し|参考|対象))",
            },
          ],
          forbiddenVisiblePatterns: ["(削減可能額|削減額|節約可能額)"],
        },
      }),
    ).toMatchObject({ pass: false });
  });

  it("allows an insight metric when exact validation is not configured", () => {
    const insightOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容を見直せそうです。",
          amount: 19475,
          amountLabel: "見直し候補額",
          amountType: "expense",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(assertFinanceResponse(insightOutput)).toMatchObject({ pass: true });
  });

  it("requires a grounded insight metric when configured", () => {
    const qualitativeInsightOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "2026-07は衣服・美容が前月より高いため見直せそうです。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(qualitativeInsightOutput, {
        config: {
          allowedInsightMetrics: [
            { amount: 19475, amountType: "balance", labelPattern: "衣服・美容" },
          ],
          requireInsightMetric: true,
        },
      }),
    ).toMatchObject({ pass: false, reason: "insight metrics 不一致" });
  });

  it("rejects an insight metric with a disallowed semantic amount type", () => {
    const insightOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "食費を見直せそうです。",
          amount: 41837,
          amountLabel: "見直し候補額",
          amountType: "expense",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(insightOutput, {
        config: {
          allowedInsightMetrics: [
            { amount: 41837, amountType: "balance", labelPattern: "(見直し|候補)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: "insight metrics 不一致" });
  });

  it("binds the insight amount to the recommended category", () => {
    const inconsistentInsightOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "衣服・美容が前月より増加したため見直せそうです。",
          amount: 41837,
          amountLabel: "食費の見直し候補",
          amountType: "balance",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(inconsistentInsightOutput, {
        config: {
          allowedInsightMetrics: [
            { amount: 19475, amountType: "balance", labelPattern: "(衣服|見直し|候補)" },
            { amount: 7364, amountType: "balance", labelPattern: "(衣服|差額|増加)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: "insight metrics 不一致" });
  });

  it("parses compound Japanese monetary units", () => {
    const compoundAmountOutput = JSON.stringify({
      text: "総資産は1億2,000万円です。",
      cards: [
        {
          type: "summary",
          title: "総資産",
          metrics: [{ label: "総資産", amount: 120000000, amountType: "balance" }],
          href: "/0/bs",
        },
      ],
    });

    expect(
      assertFinanceResponse(compoundAmountOutput, {
        config: { allowedVisibleAmounts: [120000000] },
      }),
    ).toMatchObject({ pass: true });
  });

  it.each([
    ["見直し候補は999万円です。", 9_990_000],
    ["見直し候補は2億円です。", 200_000_000],
    ["見直し候補は50千円です。", 50_000],
  ])("normalizes unsupported Japanese monetary units: %s", (text, normalizedAmount) => {
    const unitOutput = JSON.stringify({
      text,
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "支出を見直しましょう。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(unitOutput, { config: { allowedVisibleAmounts: [93341] } }),
    ).toMatchObject({ pass: false, reason: `未許可の可視金額: ${normalizedAmount}` });
  });

  it("validates monetary claims in action labels", () => {
    const actionAmountOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "支出を見直しましょう。",
          action: { label: "999,999円節約の内訳を確認", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(actionAmountOutput, {
        config: { allowedVisibleAmounts: [93341] },
      }),
    ).toMatchObject({ pass: false, reason: "未許可の可視金額: 999999" });
  });

  it("does not use hidden Markdown reference definitions as card facts", () => {
    const hiddenFactOutput = JSON.stringify({
      text: "回答本文です。\n[ref]: https://example.com/食費",
      cards: [
        {
          type: "insight",
          title: "支出改善",
          description: "支出を見直しましょう。",
          action: { label: "内訳を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(hiddenFactOutput, {
        config: { expectedCardFacts: ["食費"] },
      }),
    ).toMatchObject({ pass: false, reason: "不足 card facts: 食費" });
  });

  it("rejects an amount framed as a comparison difference", () => {
    const comparisonOutput = JSON.stringify({
      text: "交通費より食費は41,837円多いです。",
      cards: [
        {
          type: "insight",
          title: "確認",
          description: "確認します。",
          action: { label: "詳細を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(comparisonOutput, {
        config: {
          allowedVisibleAmounts: [41837],
          visibleAmountClaims: [{ label: "食費", amount: 41837 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("食費=41837(増減)") });
  });

  it.each(["上旬", "中旬", "下旬"])("rejects a non-exact month period: %s", (period) => {
    const periodOutput = JSON.stringify({
      text: `7月${period}時点の総資産は5,683,100円です。`,
      cards: [
        {
          type: "insight",
          title: "確認",
          description: "確認します。",
          action: { label: "詳細を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(periodOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          allowedVisibleDates: ["2026-07-31"],
          allowedVisibleMonths: ["2026-07"],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining(`period-*-07-${period}`) });
  });

  it("validates a percentage written as a decimal ratio", () => {
    const ratioOutput = JSON.stringify({
      text: "貯蓄率は小数で0.5です。",
      cards: [
        {
          type: "insight",
          title: "確認",
          description: "確認します。",
          action: { label: "詳細を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(ratioOutput, {
        config: {
          allowedVisiblePercentages: [29.8],
          visiblePercentageClaims: [{ label: "貯蓄率", amount: 29.8 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("50") });
  });

  it("rejects an unsupported transaction description in fallback text", () => {
    const fabricatedTransactionOutput = JSON.stringify({
      text: "明細には7月31日の架空店があります。",
      cards: [
        {
          type: "insight",
          title: "確認",
          description: "確認します。",
          action: { label: "詳細を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(fabricatedTransactionOutput, {
        config: {
          expectedTransactionGroup: {
            month: "2026-07",
            category: "食費",
            amountType: "expense",
            expectedCount: 0,
            allowedTransactions: [
              {
                ids: ["tx-a"],
                date: "2026-07-31",
                description: "すき家",
                amount: 2638,
                amountType: "expense",
                category: "食費",
              },
            ],
          },
          requireTransactionToolGrounding: true,
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("本文中の未取得明細: 架空店") });
  });

  it.each(["7月10日は架空店で支払いました。", "架空店で支払いました。"])(
    "rejects an ordinary payment claim for an unretrieved merchant: %s",
    (text) => {
      const searchResult = {
        toolName: "searchTransactions",
        input: { date: "2026-07-10", type: "expense" },
        output: {
          transactions: [
            {
              date: "2026-07-10",
              description: "成城石井",
              category: "食費",
              type: "expense",
              amount: 3152,
            },
          ],
        },
      };
      const fabricatedPaymentOutput = JSON.stringify({
        ...JSON.parse(output),
        text,
        dataToolResults: [searchResult],
        textEvidence: [{ text, allowedHrefs: [], dataToolResults: [searchResult] }],
      });

      expect(
        assertFinanceResponse(fabricatedPaymentOutput, {
          config: { requireTransactionToolGrounding: true },
        }),
      ).toMatchObject({
        pass: false,
        reason: expect.stringContaining("本文中の未取得明細: 架空店"),
      });
    },
  );

  it("accepts a retrieved merchant after an inherited-date prefix", () => {
    const searchResult = {
      toolName: "searchTransactions",
      input: { date: "2026-07-10", type: "expense" },
      output: {
        transactions: [
          {
            date: "2026-07-10",
            description: "成城石井",
            category: "食費",
            type: "expense",
            amount: 3152,
          },
        ],
      },
    };
    const text = "当日は成城石井で支払いました。";
    const paymentOutput = JSON.stringify({
      ...JSON.parse(output),
      text,
      dataToolResults: [searchResult],
      textEvidence: [{ text, allowedHrefs: [], dataToolResults: [searchResult] }],
    });

    expect(
      assertFinanceResponse(paymentOutput, {
        config: { requireTransactionToolGrounding: true },
      }),
    ).toMatchObject({ pass: true });
  });

  it.each(["東京ガス ガス代が最も安い明細です。", "最も安い明細は東京ガス ガス代です。"])(
    "validates a transaction superlative against retrieved rows: %s",
    (text) => {
      const searchResult = {
        toolName: "searchTransactions",
        input: { date: "2026-07-10", type: "expense" },
        output: {
          transactions: [
            {
              date: "2026-07-10",
              description: "成城石井",
              category: "食費",
              type: "expense",
              amount: 3152,
            },
            {
              date: "2026-07-10",
              description: "東京ガス ガス代",
              category: "光熱費",
              type: "expense",
              amount: 3435,
            },
          ],
        },
      };
      const superlativeOutput = JSON.stringify({
        ...JSON.parse(output),
        text,
        dataToolResults: [searchResult],
        textEvidence: [{ text, allowedHrefs: [], dataToolResults: [searchResult] }],
      });

      expect(
        assertFinanceResponse(superlativeOutput, {
          config: { requireTransactionToolGrounding: true },
        }),
      ).toMatchObject({ pass: false, reason: expect.stringContaining("誤った明細最上級") });
    },
  );

  it.each([
    ["東京ガス ガス代は成城石井より安いです。", false],
    ["東京ガス ガス代は成城石井より高いです。", true],
    ["成城石井より東京ガス ガス代の方が安いです。", false],
    ["成城石井より東京ガス ガス代の方が高いです。", true],
  ])("validates a pairwise transaction comparison: %s", (text, pass) => {
    const searchResult = {
      toolName: "searchTransactions",
      input: { date: "2026-07-10", type: "expense" },
      output: {
        transactions: [
          {
            date: "2026-07-10",
            description: "成城石井",
            category: "食費",
            type: "expense",
            amount: 3152,
          },
          {
            date: "2026-07-10",
            description: "東京ガス ガス代",
            category: "光熱費",
            type: "expense",
            amount: 3435,
          },
        ],
      },
    };
    const comparisonOutput = JSON.stringify({
      ...JSON.parse(output),
      text,
      dataToolResults: [searchResult],
      textEvidence: [{ text, allowedHrefs: [], dataToolResults: [searchResult] }],
    });

    expect(
      assertFinanceResponse(comparisonOutput, {
        config: { requireTransactionToolGrounding: true },
      }).pass,
    ).toBe(pass);
  });

  it("rejects a mismatched category asserted for a retrieved transaction", () => {
    const searchResult = {
      toolName: "searchTransactions",
      input: { date: "2026-07-10", type: "expense" },
      output: {
        transactions: [
          {
            date: "2026-07-10",
            description: "成城石井",
            category: "食費",
            type: "expense",
            amount: 3152,
          },
        ],
      },
    };
    const mismatchedOutput = JSON.stringify({
      ...JSON.parse(output),
      text: "成城石井のカテゴリは水道・光熱費です。",
      dataToolResults: [searchResult],
      textEvidence: [
        { text: "成城石井のカテゴリは水道・光熱費です。", dataToolResults: [searchResult] },
      ],
    });

    expect(
      assertFinanceResponse(mismatchedOutput, {
        config: { requireTransactionToolGrounding: true },
      }),
    ).toMatchObject({
      pass: false,
      reason: expect.stringContaining("誤った明細属性: 成城石井:カテゴリ=水道・光熱費"),
    });
  });

  it("rejects a transaction attribute asserted before its retrieval evidence", () => {
    const searchResult = {
      toolName: "searchTransactions",
      input: { date: "2026-07-10", type: "expense" },
      output: {
        transactions: [
          {
            date: "2026-07-10",
            description: "成城石井",
            category: "食費",
            type: "expense",
            amount: 3152,
          },
        ],
      },
    };
    const earlyClaimOutput = JSON.stringify({
      ...JSON.parse(output),
      text: "成城石井のカテゴリは食費です。",
      dataToolResults: [searchResult],
      textEvidence: [{ text: "成城石井のカテゴリは食費です。", dataToolResults: [] }],
    });

    expect(
      assertFinanceResponse(earlyClaimOutput, {
        config: { requireTransactionToolGrounding: true },
      }),
    ).toMatchObject({
      pass: false,
      reason: expect.stringContaining("誤った明細属性: 成城石井:カテゴリ=食費"),
    });
  });

  it("rejects an attribute claim for a transaction absent from retrieval evidence", () => {
    const searchResult = {
      toolName: "searchTransactions",
      input: { date: "2026-07-10", type: "expense" },
      output: {
        transactions: [
          {
            date: "2026-07-10",
            description: "成城石井",
            category: "食費",
            type: "expense",
            amount: 3152,
          },
        ],
      },
    };
    const text = "架空店のカテゴリは食費です。";
    const fabricatedAttributeOutput = JSON.stringify({
      ...JSON.parse(output),
      text,
      dataToolResults: [searchResult],
      textEvidence: [{ text, dataToolResults: [searchResult] }],
    });

    expect(
      assertFinanceResponse(fabricatedAttributeOutput, {
        config: { requireTransactionToolGrounding: true },
      }),
    ).toMatchObject({
      pass: false,
      reason: expect.stringContaining("誤った明細属性: 架空店:カテゴリ=食費"),
    });
  });

  it("accepts a transaction attribute when one same-description row matches", () => {
    const searchResult = {
      toolName: "searchTransactions",
      input: { month: "2026-07", type: "expense" },
      output: {
        transactions: [
          {
            date: "2026-07-10",
            description: "成城石井",
            category: "食費",
            type: "expense",
            amount: 3152,
          },
          {
            date: "2026-07-20",
            description: "成城石井",
            category: "日用品",
            type: "expense",
            amount: 1200,
          },
        ],
      },
    };
    const groundedOutput = JSON.stringify({
      ...JSON.parse(output),
      text: "成城石井のカテゴリは食費です。",
      dataToolResults: [searchResult],
      textEvidence: [{ text: "成城石井のカテゴリは食費です。", dataToolResults: [searchResult] }],
    });

    expect(
      assertFinanceResponse(groundedOutput, {
        config: { requireTransactionToolGrounding: true },
      }),
    ).toMatchObject({ pass: true });
  });

  it("rejects an unsupported fallback transaction with expectedTransactions", () => {
    const fabricatedTransactionOutput = JSON.stringify({
      text: "明細には7月10日の架空店があります。",
      cards: [
        {
          type: "insight",
          title: "確認",
          description: "確認します。",
          action: { label: "詳細を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(fabricatedTransactionOutput, {
        config: {
          expectedTransactions: [
            {
              ids: ["tx-a"],
              date: "2026-07-10",
              description: "成城石井",
              amount: 3435,
              amountType: "expense",
              category: "食費",
            },
          ],
          requireTransactionToolGrounding: true,
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("本文中の未取得明細: 架空店") });
  });

  it("does not treat unrelated existence prose as a transaction description", () => {
    const proseOutput = JSON.stringify({
      text: "明細を確認しました。改善余地があります。",
      cards: [
        {
          type: "insight",
          title: "確認",
          description: "確認します。",
          action: { label: "詳細を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(proseOutput, {
        config: { requireTransactionToolGrounding: true },
      }),
    ).toMatchObject({ pass: true });
  });

  it("preserves spaces in a grounded fallback transaction description", () => {
    const spacedDescriptionOutput = JSON.stringify({
      text: "明細には7月10日の東京ガス ガス代があります。",
      cards: [
        {
          type: "insight",
          title: "確認",
          description: "確認します。",
          action: { label: "詳細を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(spacedDescriptionOutput, {
        config: {
          expectedTransactions: [
            {
              ids: ["tx-a"],
              date: "2026-07-10",
              description: "東京ガス ガス代",
              amount: 3435,
              amountType: "expense",
            },
          ],
          requireTransactionToolGrounding: true,
        },
      }),
    ).toMatchObject({
      pass: false,
      reason: "transactions 不一致 / 本文中の未取得明細: 東京ガス ガス代",
    });
  });

  it("rejects an amount whose configured label is explicitly excluded", () => {
    const excludedLabelOutput = JSON.stringify({
      text: "総資産以外の評価額は5,683,100円です。",
      cards: [
        {
          type: "insight",
          title: "確認",
          description: "確認します。",
          action: { label: "詳細を見る", href: "/0/bs" },
        },
      ],
    });

    expect(
      assertFinanceResponse(excludedLabelOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("総資産=5683100(否定)") });
  });

  it("rejects a percentage with a shorthand wrong denominator", () => {
    const wrongBasisOutput = JSON.stringify({
      text: "食費は収入比19.03%です。",
      cards: [
        {
          type: "insight",
          title: "確認",
          description: "確認します。",
          action: { label: "詳細を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(wrongBasisOutput, {
        config: {
          allowedVisiblePercentages: [19.03],
          visiblePercentageClaims: [
            { label: "食費", amount: 19.03, basisPattern: "(支出|出費|総支出)" },
          ],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("分母:収入") });
  });

  it("rejects an unsupported contained transaction description", () => {
    const containedTransactionOutput = JSON.stringify({
      text: "明細には7月10日の架空店が含まれます。",
      cards: [
        {
          type: "insight",
          title: "確認",
          description: "確認します。",
          action: { label: "詳細を見る", href: "/0/cf/2026-07" },
        },
      ],
    });

    expect(
      assertFinanceResponse(containedTransactionOutput, {
        config: { requireTransactionToolGrounding: true },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("本文中の未取得明細: 架空店") });
  });

  it("rejects an unsupported transaction description in card prose", () => {
    const cardProseOutput = JSON.stringify({
      text: "回答",
      cards: [
        {
          type: "summary",
          title: "7月10日の支出",
          description: "明細には7月10日の架空店があります。",
          metrics: [{ label: "支出", amount: 3435, amountType: "expense" }],
          href: "/0/cf/2026-07",
        },
      ],
    });

    expect(
      assertFinanceResponse(cardProseOutput, {
        config: { requireTransactionToolGrounding: true },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("本文中の未取得明細: 架空店") });
  });

  it("rejects transaction prose emitted before its search evidence", () => {
    const searchResult = {
      toolName: "searchTransactions",
      input: { date: "2026-07-10", type: "expense" },
      output: {
        transactions: [
          {
            date: "2026-07-10",
            description: "Test Store",
            category: "食費",
            amount: 3152,
            type: "expense",
          },
        ],
      },
    };
    const earlyProseOutput = JSON.stringify({
      ...JSON.parse(output),
      text: "明細には7月10日のTest Storeがあります。",
      textEvidence: [{ text: "明細には7月10日のTest Storeがあります。", dataToolResults: [] }],
      dataToolResults: [searchResult],
    });

    expect(
      assertFinanceResponse(earlyProseOutput, {
        config: {
          requireTransactionToolGrounding: true,
        },
      }),
    ).toMatchObject({
      pass: false,
      reason: expect.stringContaining("本文中の未取得明細: Test Store"),
    });
  });

  it.each(["今月の食費や明細はありません。", "7月10日の取引はありません。"])(
    "rejects a textual no-data claim when fixture rows exist: %s",
    (text) => {
      const noDataOutput = JSON.stringify({
        ...JSON.parse(output),
        text,
      });

      expect(
        assertFinanceResponse(noDataOutput, {
          config: {
            forbiddenVisiblePatterns: [
              "(食費|7月10日|明細|取引).{0,16}(ありません|ない|なし|見つかりません|ゼロ)",
            ],
          },
        }),
      ).toMatchObject({ pass: false, reason: expect.stringContaining("禁止された可視表現") });
    },
  );

  it.each(["豪ドル", "NZドル", "カナダドル"])(
    "rejects a prefixed foreign currency: %s",
    (currency) => {
      const currencyOutput = JSON.stringify({
        text: `総資産は5,683,100${currency}です。`,
        cards: [
          {
            type: "insight",
            title: "確認",
            description: "確認します。",
            action: { label: "詳細を見る", href: "/0/bs" },
          },
        ],
      });

      expect(
        assertFinanceResponse(currencyOutput, {
          config: {
            allowedVisibleAmounts: [5683100],
            visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
          },
        }),
      ).toMatchObject({ pass: false, reason: expect.stringContaining(currency) });
    },
  );

  it.each(["月初", "月末"])("rejects an ambiguous standalone month boundary: %s", (boundary) => {
    const boundaryOutput = JSON.stringify({
      text: `${boundary}時点の総資産は5,683,100円です。`,
      cards: [
        {
          type: "insight",
          title: "確認",
          description: "確認します。",
          action: { label: "詳細を見る", href: "/0/bs" },
        },
      ],
    });

    expect(
      assertFinanceResponse(boundaryOutput, {
        config: {
          allowedVisibleAmounts: [5683100],
          allowedVisibleDates: ["2026-07-31"],
          allowedVisibleMonths: ["2026-07"],
          visibleAmountClaims: [{ label: "総資産", amount: 5683100 }],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining(`relative-${boundary}`) });
  });
});
