import { describe, expect, it } from "vitest";
import type { FinanceChatEvaluationCase } from "./finance-chat-cases";
import {
  evaluateFinanceChatTrace,
  type FinanceChatEvaluationTrace,
} from "./finance-chat-evaluator";

const evaluationCase: FinanceChatEvaluationCase = {
  id: "monthly-summary",
  prompt: "今月どう？",
  toolStrategies: [[{ name: "getFinancialMetrics" }], [{ name: "getLatestMonthlySummary" }]],
  allowedDataTools: ["getFinancialMetrics", "getLatestMonthlySummary"],
  navigationInput: { page: "cashFlow", month: "2026-07" },
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
    steps: [
      {
        toolCalls: [{ toolName: "getLatestMonthlySummary", input: {} }],
        toolResults: [
          { toolName: "getLatestMonthlySummary", output: { income: 300_000, expense: 250_000 } },
        ],
      },
      {
        toolCalls: [
          { toolName: "getFinanceDashboardRoute", input: { page: "cashFlow", month: "2026-07" } },
        ],
        toolResults: [{ toolName: "getFinanceDashboardRoute", output: { href } }],
      },
      {
        toolCalls: [{ toolName: "presentFinanceCards", input: { cards } }],
        toolResults: [{ toolName: "presentFinanceCards", output: cards }],
      },
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
    const result = evaluateFinanceChatTrace(evaluationCase, createTrace({ steps: [] }));

    expect(result.passed).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        "必須ツールまたは引数が期待する戦略を満たさない",
        "presentFinanceCards 呼び出し回数: 0（期待値: 1）",
        "presentFinanceCards 結果数: 0（期待値: 1）",
        "カード出力が financeChatCardsSchema を満たさない",
      ]),
    );
  });

  it("rejects duplicate presentation and data calls", () => {
    const base = createTrace();
    const dataStep = base.steps[0]!;
    const presentationStep = base.steps[2]!;
    const result = evaluateFinanceChatTrace(
      evaluationCase,
      createTrace({
        steps: [...base.steps, dataStep, presentationStep],
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
        steps: [
          createTrace().steps[0]!,
          {
            toolCalls: [{ toolName: "getFinanceDashboardRoute", input: {} }],
            toolResults: [{ toolName: "getFinanceDashboardRoute", output: { href: "/group-a" } }],
          },
          {
            toolCalls: [{ toolName: "presentFinanceCards", input: { cards: reversedCards } }],
            toolResults: [{ toolName: "presentFinanceCards", output: reversedCards }],
          },
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
        steps: [
          ...createTrace().steps.slice(0, 2),
          {
            toolCalls: [{ toolName: "presentFinanceCards", input: { cards: tooManyCards } }],
            toolResults: [{ toolName: "presentFinanceCards", output: tooManyCards }],
          },
        ],
      }),
    );

    expect(result.violations).toContain("カード出力が financeChatCardsSchema を満たさない");
  });

  it("accepts an empty-only response without a navigation call", () => {
    const emptyCase: FinanceChatEvaluationCase = {
      id: "no-data",
      prompt: "2030年1月の支出は？",
      toolStrategies: [[{ name: "searchTransactions", input: { month: "2030-01" } }]],
      allowedDataTools: ["searchTransactions"],
      navigationInput: { page: "cashFlow", month: "2030-01" },
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
      steps: [
        {
          toolCalls: [{ toolName: "searchTransactions", input: { month: "2030-01" } }],
          toolResults: [{ toolName: "searchTransactions", output: [] }],
        },
        {
          toolCalls: [{ toolName: "presentFinanceCards", input: { cards: emptyCards } }],
          toolResults: [{ toolName: "presentFinanceCards", output: emptyCards }],
        },
      ],
    });

    expect(result.passed).toBe(true);
  });

  it("rejects invalid tool calls", () => {
    const base = createTrace();
    const result = evaluateFinanceChatTrace(
      evaluationCase,
      createTrace({
        steps: [
          {
            toolCalls: [{ toolName: "unknownTool", input: {}, invalid: true }],
            toolResults: [],
          },
          ...base.steps,
        ],
      }),
    );

    expect(result.violations).toContain("不正なツール呼び出しが含まれる");
  });

  it("accepts the prompt-preferred financial metrics strategy", () => {
    const base = createTrace();
    const result = evaluateFinanceChatTrace(
      evaluationCase,
      createTrace({
        steps: [
          {
            toolCalls: [{ toolName: "getFinancialMetrics", input: {} }],
            toolResults: [{ toolName: "getFinancialMetrics", output: { savingsRate: 20 } }],
          },
          ...base.steps.slice(1),
        ],
      }),
    );

    expect(result.passed).toBe(true);
  });

  it("rejects a required tool with inputs for the wrong intent", () => {
    const categoryCase: FinanceChatEvaluationCase = {
      id: "category-expense",
      prompt: "今月の食費は？",
      toolStrategies: [
        [
          {
            name: "searchTransactions",
            input: { month: "2026-07", category: "食費", type: "expense" },
          },
        ],
      ],
      allowedDataTools: ["searchTransactions"],
      navigationInput: { page: "cashFlow", month: "2026-07" },
      expectedCardTypes: ["summary", "insight"],
    };
    const base = createTrace();

    const result = evaluateFinanceChatTrace(categoryCase, {
      steps: [
        {
          toolCalls: [
            {
              toolName: "searchTransactions",
              input: { month: "2026-06", category: "交通費", type: "income" },
            },
          ],
          toolResults: [{ toolName: "searchTransactions", output: [] }],
        },
        ...base.steps.slice(1),
      ],
    });

    expect(result.violations).toContain("必須ツールまたは引数が期待する戦略を満たさない");
  });

  it("rejects navigation completed in the presentation step or later", () => {
    const base = createTrace();
    const navigationStep = base.steps[1]!;
    const presentationStep = base.steps[2]!;
    const result = evaluateFinanceChatTrace(evaluationCase, {
      steps: [
        base.steps[0]!,
        {
          toolCalls: [...presentationStep.toolCalls, ...navigationStep.toolCalls],
          toolResults: [...presentationStep.toolResults, ...navigationStep.toolResults],
        },
      ],
    });

    expect(result.violations).toEqual(
      expect.arrayContaining([
        "ナビゲーションツールの引数または呼び出し順が期待値を満たさない",
        `ナビゲーションツール未検証の CTA: ${href}, ${href}`,
      ]),
    );
  });

  it("rejects navigation to the wrong page even when its returned href is used", () => {
    const base = createTrace();
    const result = evaluateFinanceChatTrace(evaluationCase, {
      steps: [
        base.steps[0]!,
        {
          toolCalls: [{ toolName: "getFinanceDashboardRoute", input: { page: "dashboard" } }],
          toolResults: [{ toolName: "getFinanceDashboardRoute", output: { href } }],
        },
        base.steps[2]!,
      ],
    });

    expect(result.violations).toContain(
      "ナビゲーションツールの引数または呼び出し順が期待値を満たさない",
    );
  });

  it("rejects overlapping data retrieval through a tool outside the case strategy", () => {
    const base = createTrace();
    const result = evaluateFinanceChatTrace(evaluationCase, {
      steps: [
        base.steps[0]!,
        {
          toolCalls: [{ toolName: "getLatestTotalAssets", input: {} }],
          toolResults: [{ toolName: "getLatestTotalAssets", output: 5_000_000 }],
        },
        ...base.steps.slice(1),
      ],
    });

    expect(result.violations).toContain("許可されていないデータ取得: getLatestTotalAssets");
  });
});
