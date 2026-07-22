import { describe, expect, it } from "vitest";
import assertFinanceResponse from "./assertions";

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
      reason: "textEvidence が欠落または最終テキストと不一致です。",
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
            "((支出|出費).{0,12}(収入|所得).{0,12}(上回|超え|多い)|(収入|所得).{0,12}(支出|出費).{0,12}(下回|少ない))",
          ],
        },
      }),
    ).toMatchObject({ pass: false });
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
          expectedMetrics: [{ label: "収支", amount: 93341, amountType: "balance" }],
        },
      }),
    ).toMatchObject({ pass: false, reason: "summary metrics 不一致: expected=収支=93341" });
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
      reason: "route 不一致: expected=/0/cf/2026-07 actual=/0/cf/2026-07,/0/bs",
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
      reason: "route 不一致: expected=/0/cf/2026-07 actual=/0/cf/2026-07,/0/bs",
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
      reason: "route 不一致: expected=/0/cf/2026-07 actual=/0/cf/2026-07,/0/bs",
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
});
