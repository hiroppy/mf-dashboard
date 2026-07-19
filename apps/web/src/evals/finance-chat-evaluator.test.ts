import { describe, expect, it } from "vitest";
import type { FinanceChatEvaluationCase } from "./finance-chat-cases";
import {
  evaluateFinanceChatTrace,
  type FinanceChatEvaluationTrace,
} from "./finance-chat-evaluator";

const evaluationCase: FinanceChatEvaluationCase = {
  id: "monthly-summary",
  prompt: "今月どう？",
  requiredTools: ["getLatestMonthlySummary"],
  expectedCardTypes: ["summary", "insight"],
};
const href = "/group-a/cf/2026-07";
const cards = [
  {
    type: "summary" as const,
    title: "今月の収支",
    metrics: [{ label: "収支", amount: 50_000, amountType: "balance" as const }],
    href,
  },
  {
    type: "insight" as const,
    title: "傾向",
    description: "前月より支出が減っています。",
    action: { label: "内訳を確認", href },
  },
];

function createTrace(
  overrides: Partial<FinanceChatEvaluationTrace> = {},
): FinanceChatEvaluationTrace {
  return {
    toolCalls: [
      { toolName: "getLatestMonthlySummary", input: {} },
      { toolName: "getFinanceDashboardRoute", input: { page: "cashFlow", month: "2026-07" } },
      { toolName: "presentFinanceCards", input: { cards } },
    ],
    toolResults: [
      { toolName: "getLatestMonthlySummary", output: { income: 300_000, expense: 250_000 } },
      { toolName: "getFinanceDashboardRoute", output: { href } },
      { toolName: "presentFinanceCards", output: cards },
    ],
    ...overrides,
  };
}

describe("evaluateFinanceChatTrace", () => {
  it("accepts a trace that matches the expected tools, ordered cards, and verified CTA", () => {
    expect(evaluateFinanceChatTrace(evaluationCase, createTrace())).toEqual({
      passed: true,
      violations: [],
      toolNames: ["getLatestMonthlySummary", "getFinanceDashboardRoute", "presentFinanceCards"],
      cardTypes: ["summary", "insight"],
    });
  });

  it("reports missing required tools and presentation calls", () => {
    const result = evaluateFinanceChatTrace(
      evaluationCase,
      createTrace({ toolCalls: [], toolResults: [] }),
    );

    expect(result.passed).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        "必須ツール未使用: getLatestMonthlySummary",
        "presentFinanceCards 呼び出し回数: 0（期待値: 1）",
        "presentFinanceCards 結果数: 0（期待値: 1）",
        "カード出力が financeChatCardsSchema を満たさない",
      ]),
    );
  });

  it("rejects duplicate presentation and data calls", () => {
    const base = createTrace();
    const result = evaluateFinanceChatTrace(
      evaluationCase,
      createTrace({
        toolCalls: [...base.toolCalls, base.toolCalls[0]!, base.toolCalls[2]!],
        toolResults: [...base.toolResults, base.toolResults[2]!],
      }),
    );

    expect(result.violations).toEqual(
      expect.arrayContaining([
        "同一データの重複取得: getLatestMonthlySummary",
        "presentFinanceCards 呼び出し回数: 2（期待値: 1）",
        "presentFinanceCards 結果数: 2（期待値: 1）",
      ]),
    );
  });

  it("rejects unexpected card order and a CTA not returned by navigation", () => {
    const reversedCards = [...cards].reverse();
    const result = evaluateFinanceChatTrace(
      evaluationCase,
      createTrace({
        toolResults: [
          { toolName: "getFinanceDashboardRoute", output: { href: "/group-a" } },
          { toolName: "presentFinanceCards", output: reversedCards },
        ],
      }),
    );

    expect(result.violations).toEqual(
      expect.arrayContaining([
        "カード構成: insight → summary（期待値: summary → insight）",
        `ナビゲーションツール未検証の CTA: ${href}, ${href}`,
      ]),
    );
  });

  it("uses the card schema to enforce the upper card boundary", () => {
    const tooManyCards = Array.from({ length: 7 }, (_, index) => ({
      type: "summary" as const,
      title: `Summary ${index}`,
      metrics: [{ label: "収支", amount: index, amountType: "balance" as const }],
      href,
    }));

    const result = evaluateFinanceChatTrace(
      evaluationCase,
      createTrace({
        toolResults: [{ toolName: "presentFinanceCards", output: tooManyCards }],
      }),
    );

    expect(result.violations).toContain("カード出力が financeChatCardsSchema を満たさない");
  });

  it("accepts an empty-only response without a navigation call", () => {
    const emptyCase: FinanceChatEvaluationCase = {
      id: "no-data",
      prompt: "2030年1月の支出は？",
      requiredTools: ["searchTransactions"],
      expectedCardTypes: ["empty"],
    };
    const emptyCards = [
      {
        type: "empty" as const,
        title: "データがありません",
        description: "期間を変更してください。",
        prompts: ["別の月を見る"],
      },
    ];

    const result = evaluateFinanceChatTrace(emptyCase, {
      toolCalls: [
        { toolName: "searchTransactions", input: { month: "2030-01" } },
        { toolName: "presentFinanceCards", input: { cards: emptyCards } },
      ],
      toolResults: [
        { toolName: "searchTransactions", output: [] },
        { toolName: "presentFinanceCards", output: emptyCards },
      ],
    });

    expect(result.passed).toBe(true);
  });

  it("rejects invalid tool calls", () => {
    const base = createTrace();
    const result = evaluateFinanceChatTrace(
      evaluationCase,
      createTrace({
        toolCalls: [{ toolName: "unknownTool", input: {}, invalid: true }, ...base.toolCalls],
      }),
    );

    expect(result.violations).toContain("不正なツール呼び出しが含まれる");
  });
});
