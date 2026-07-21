import { describe, expect, it } from "vitest";
import type { FinanceChatCard } from "../chat/cards";
import type { FinanceChatEvaluationCase } from "./finance-chat-cases";
import {
  evaluateFinanceChatTrace,
  type FinanceChatEvaluationTrace,
} from "./finance-chat-evaluator";

const evaluationCase: FinanceChatEvaluationCase = {
  id: "monthly-summary",
  prompt: "今月どう？",
  toolStrategies: [[{ name: "getLatestMonthlySummary" }]],
  allowedDataTools: ["getLatestMonthlySummary"],
  navigationInput: { page: "cashFlow", month: "2026-07" },
  expectedCardTypes: ["summary", "insight"],
};
const categoryEvaluationCase: FinanceChatEvaluationCase = {
  ...evaluationCase,
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
    text: "今月の収支は50,000円です。",
    steps: [
      {
        toolCalls: [{ toolCallId: "data", toolName: "getLatestMonthlySummary", input: {} }],
        toolResults: [
          {
            toolCallId: "data",
            toolName: "getLatestMonthlySummary",
            output: { income: 300_000, expense: 250_000 },
          },
        ],
      },
      {
        toolCalls: [
          {
            toolCallId: "navigation",
            toolName: "getFinanceDashboardRoute",
            input: { page: "cashFlow", month: "2026-07" },
          },
        ],
        toolResults: [
          { toolCallId: "navigation", toolName: "getFinanceDashboardRoute", output: { href } },
        ],
      },
      {
        toolCalls: [
          { toolCallId: "presentation", toolName: "presentFinanceCards", input: { cards } },
        ],
        toolResults: [
          { toolCallId: "presentation", toolName: "presentFinanceCards", output: cards },
        ],
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
            toolCalls: [
              { toolCallId: "navigation", toolName: "getFinanceDashboardRoute", input: {} },
            ],
            toolResults: [
              {
                toolCallId: "navigation",
                toolName: "getFinanceDashboardRoute",
                output: { href: "/group-a" },
              },
            ],
          },
          {
            toolCalls: [
              {
                toolCallId: "presentation",
                toolName: "presentFinanceCards",
                input: { cards: reversedCards },
              },
            ],
            toolResults: [
              {
                toolCallId: "presentation",
                toolName: "presentFinanceCards",
                output: reversedCards,
              },
            ],
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
            toolCalls: [
              {
                toolCallId: "presentation",
                toolName: "presentFinanceCards",
                input: { cards: tooManyCards },
              },
            ],
            toolResults: [
              {
                toolCallId: "presentation",
                toolName: "presentFinanceCards",
                output: tooManyCards,
              },
            ],
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
      text: "対象期間のデータはありません。",
      steps: [
        {
          toolCalls: [
            { toolCallId: "data", toolName: "searchTransactions", input: { month: "2030-01" } },
          ],
          toolResults: [{ toolCallId: "data", toolName: "searchTransactions", output: [] }],
        },
        {
          toolCalls: [
            {
              toolCallId: "presentation",
              toolName: "presentFinanceCards",
              input: { cards: emptyCards },
            },
          ],
          toolResults: [
            { toolCallId: "presentation", toolName: "presentFinanceCards", output: emptyCards },
          ],
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
            toolCalls: [
              { toolCallId: "invalid", toolName: "unknownTool", input: {}, invalid: true },
            ],
            toolResults: [],
          },
          ...base.steps,
        ],
      }),
    );

    expect(result.violations).toContain("不正なツール呼び出しが含まれる");
  });

  it("rejects financial metrics without current-month cash-flow data", () => {
    const base = createTrace();
    const result = evaluateFinanceChatTrace(
      evaluationCase,
      createTrace({
        steps: [
          {
            toolCalls: [{ toolCallId: "metrics", toolName: "getFinancialMetrics", input: {} }],
            toolResults: [
              {
                toolCallId: "metrics",
                toolName: "getFinancialMetrics",
                output: { savingsRate: 20, balance: 50_000 },
              },
            ],
          },
          ...base.steps.slice(1),
        ],
      }),
    );

    expect(result.violations).toContain("必須ツールまたは引数が期待する戦略を満たさない");
  });

  it("rejects a required tool with inputs for the wrong intent", () => {
    const base = createTrace();

    const result = evaluateFinanceChatTrace(categoryEvaluationCase, {
      steps: [
        {
          toolCalls: [
            {
              toolCallId: "wrong-data",
              toolName: "searchTransactions",
              input: { month: "2026-06", category: "交通費", type: "income" },
            },
          ],
          toolResults: [{ toolCallId: "wrong-data", toolName: "searchTransactions", output: [] }],
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
          toolCalls: [
            {
              toolCallId: "wrong-navigation",
              toolName: "getFinanceDashboardRoute",
              input: { page: "dashboard" },
            },
          ],
          toolResults: [
            {
              toolCallId: "wrong-navigation",
              toolName: "getFinanceDashboardRoute",
              output: { href },
            },
          ],
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
          toolCalls: [{ toolCallId: "assets", toolName: "getLatestTotalAssets", input: {} }],
          toolResults: [
            { toolCallId: "assets", toolName: "getLatestTotalAssets", output: 5_000_000 },
          ],
        },
        ...base.steps.slice(1),
      ],
    });

    expect(result.violations).toContain("許可されていないデータ取得: getLatestTotalAssets");
  });

  it("grounds a scalar total-assets tool result as currency", () => {
    const assetsCase: FinanceChatEvaluationCase = {
      id: "total-assets",
      prompt: "総資産は？",
      toolStrategies: [[{ name: "getLatestTotalAssets" }]],
      allowedDataTools: ["getLatestTotalAssets"],
      navigationInput: { page: "balanceSheet" },
      expectedCardTypes: ["summary"],
    };
    const assetsHref = "/group-a/bs";
    const assetsCards = [
      {
        type: "summary" as const,
        title: "総資産",
        metrics: [{ label: "総資産", amount: 5_000_000, amountType: "balance" as const }],
        href: assetsHref,
      },
    ];
    const result = evaluateFinanceChatTrace(assetsCase, {
      text: "総資産は5,000,000円です。",
      steps: [
        {
          toolCalls: [{ toolCallId: "assets", toolName: "getLatestTotalAssets", input: {} }],
          toolResults: [
            { toolCallId: "assets", toolName: "getLatestTotalAssets", output: 5_000_000 },
          ],
        },
        {
          toolCalls: [
            {
              toolCallId: "navigation",
              toolName: "getFinanceDashboardRoute",
              input: { page: "balanceSheet" },
            },
          ],
          toolResults: [
            {
              toolCallId: "navigation",
              toolName: "getFinanceDashboardRoute",
              output: { href: assetsHref },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolCallId: "presentation",
              toolName: "presentFinanceCards",
              input: { cards: assetsCards },
            },
          ],
          toolResults: [
            {
              toolCallId: "presentation",
              toolName: "presentFinanceCards",
              output: assetsCards,
            },
          ],
        },
      ],
    });

    expect(result.passed).toBe(true);
  });

  it("rejects data calls without a matching result before presentation", () => {
    const base = createTrace();
    const result = evaluateFinanceChatTrace(evaluationCase, {
      steps: [{ ...base.steps[0]!, toolResults: [] }, ...base.steps.slice(1)],
    });

    expect(result.violations).toContain("必須ツールまたは引数が期待する戦略を満たさない");
  });

  it("rejects data completed in the presentation step", () => {
    const base = createTrace();
    const dataStep = base.steps[0]!;
    const presentationStep = base.steps[2]!;
    const result = evaluateFinanceChatTrace(evaluationCase, {
      steps: [
        base.steps[1]!,
        {
          toolCalls: [...dataStep.toolCalls, ...presentationStep.toolCalls],
          toolResults: [...dataStep.toolResults, ...presentationStep.toolResults],
        },
      ],
    });

    expect(result.violations).toContain("必須ツールまたは引数が期待する戦略を満たさない");
  });

  it("correlates the expected navigation call and result by toolCallId", () => {
    const base = createTrace();
    const result = evaluateFinanceChatTrace(evaluationCase, {
      steps: [
        base.steps[0]!,
        {
          toolCalls: [
            {
              toolCallId: "expected-navigation",
              toolName: "getFinanceDashboardRoute",
              input: { page: "cashFlow", month: "2026-07" },
            },
            {
              toolCallId: "wrong-navigation",
              toolName: "getFinanceDashboardRoute",
              input: { page: "dashboard" },
            },
          ],
          toolResults: [
            {
              toolCallId: "wrong-navigation",
              toolName: "getFinanceDashboardRoute",
              output: { href },
            },
          ],
        },
        base.steps[2]!,
      ],
    });

    expect(result.violations).toEqual(
      expect.arrayContaining([
        "ナビゲーションツールの引数または呼び出し順が期待値を満たさない",
        `ナビゲーションツール未検証の CTA: ${href}, ${href}`,
      ]),
    );
  });

  it("canonicalizes input keys when detecting duplicate data calls", () => {
    const base = createTrace();
    const firstInput = { month: "2026-07", category: "食費", type: "expense" };
    const secondInput = { type: "expense", category: "食費", month: "2026-07" };
    const result = evaluateFinanceChatTrace(categoryEvaluationCase, {
      steps: [
        {
          toolCalls: [
            { toolCallId: "first", toolName: "searchTransactions", input: firstInput },
            { toolCallId: "second", toolName: "searchTransactions", input: secondInput },
          ],
          toolResults: [
            { toolCallId: "first", toolName: "searchTransactions", output: [] },
            { toolCallId: "second", toolName: "searchTransactions", output: [] },
          ],
        },
        ...base.steps.slice(1),
      ],
    });

    expect(result.violations).toContain("同一データの重複取得: searchTransactions");
  });

  it("rejects extra filters and additional calls with unapproved inputs", () => {
    const base = createTrace();
    const extraFilter = evaluateFinanceChatTrace(categoryEvaluationCase, {
      steps: [
        {
          toolCalls: [
            {
              toolCallId: "extra-filter",
              toolName: "searchTransactions",
              input: { month: "2026-07", category: "食費", type: "expense", limit: 1 },
            },
          ],
          toolResults: [{ toolCallId: "extra-filter", toolName: "searchTransactions", output: [] }],
        },
        ...base.steps.slice(1),
      ],
    });
    const additionalCall = evaluateFinanceChatTrace(categoryEvaluationCase, {
      steps: [
        {
          toolCalls: [
            {
              toolCallId: "expected",
              toolName: "searchTransactions",
              input: { month: "2026-07", category: "食費", type: "expense" },
            },
            {
              toolCallId: "unapproved",
              toolName: "searchTransactions",
              input: { month: "2026-06", category: "交通費", type: "expense" },
            },
          ],
          toolResults: [
            { toolCallId: "expected", toolName: "searchTransactions", output: [] },
            { toolCallId: "unapproved", toolName: "searchTransactions", output: [] },
          ],
        },
        ...base.steps.slice(1),
      ],
    });

    expect(extraFilter.violations).toContain("必須ツールまたは引数が期待する戦略を満たさない");
    expect(additionalCall.violations).toContain("必須ツールまたは引数が期待する戦略を満たさない");
  });

  it("rejects card amounts that are not grounded in correlated data results", () => {
    const ungroundedCards = cards.map((card) =>
      card.type === "summary"
        ? { ...card, metrics: [{ ...card.metrics[0]!, amount: 9_000_000 }] }
        : card,
    );
    const base = createTrace();
    const result = evaluateFinanceChatTrace(evaluationCase, {
      text: "今月の収支です。",
      steps: [
        base.steps[0]!,
        base.steps[1]!,
        {
          toolCalls: [
            {
              toolCallId: "presentation",
              toolName: "presentFinanceCards",
              input: { cards: ungroundedCards },
            },
          ],
          toolResults: [
            {
              toolCallId: "presentation",
              toolName: "presentFinanceCards",
              output: ungroundedCards,
            },
          ],
        },
      ],
    });

    expect(result.violations).toContain(
      "カード内容に取得結果で根拠付けられない金融 claim が含まれる",
    );
  });

  it("rejects transaction details and categories absent from data results", () => {
    const transactionCase: FinanceChatEvaluationCase = {
      ...categoryEvaluationCase,
      expectedCardTypes: ["transactionList"],
    };
    const transactionCards = [
      {
        type: "transactionList" as const,
        title: "明細",
        transactions: [
          {
            id: "invented",
            date: "2026-07-10",
            description: "架空の支出",
            category: "食費",
            amount: 1_000,
            amountType: "expense" as const,
          },
        ],
        href,
      },
    ];
    const base = createTrace();
    const result = evaluateFinanceChatTrace(transactionCase, {
      text: "明細を表示します。",
      steps: [
        {
          toolCalls: [
            {
              toolCallId: "data",
              toolName: "searchTransactions",
              input: { month: "2026-07", category: "食費", type: "expense" },
            },
          ],
          toolResults: [
            {
              toolCallId: "data",
              toolName: "searchTransactions",
              output: [
                {
                  id: "actual",
                  date: "2026-07-10",
                  description: "食品店",
                  category: "食費",
                  amount: 1_000,
                },
              ],
            },
          ],
        },
        base.steps[1]!,
        {
          toolCalls: [
            {
              toolCallId: "presentation",
              toolName: "presentFinanceCards",
              input: { cards: transactionCards },
            },
          ],
          toolResults: [
            {
              toolCallId: "presentation",
              toolName: "presentFinanceCards",
              output: transactionCards,
            },
          ],
        },
      ],
    });

    expect(result.violations).toContain(
      "カード内容に取得結果で根拠付けられない金融 claim が含まれる",
    );
  });

  it("rejects ungrounded financial claims in the final assistant text", () => {
    const result = evaluateFinanceChatTrace(
      evaluationCase,
      createTrace({ text: "今月の収支は9,000,000円です。" }),
    );

    expect(result.violations).toContain(
      "最終回答に取得結果またはカードと一致しない金融 claim が含まれる",
    );
  });

  it("rejects ungrounded financial claims in card prose", () => {
    const proseCards = cards.map((card) =>
      card.type === "insight" ? { ...card, description: "支出は9,000,000円です。" } : card,
    );
    const base = createTrace();
    const presentation = base.steps[2]!;
    const result = evaluateFinanceChatTrace(evaluationCase, {
      ...base,
      steps: [
        ...base.steps.slice(0, 2),
        {
          toolCalls: presentation.toolCalls.map((call) => ({
            ...call,
            input: { cards: proseCards },
          })),
          toolResults: presentation.toolResults.map((toolResult) => ({
            ...toolResult,
            output: proseCards,
          })),
        },
      ],
    });

    expect(result.violations).toContain(
      "カード内容に取得結果で根拠付けられない金融 claim が含まれる",
    );
  });

  it("recognizes yen-prefixed claims without a trailing unit", () => {
    const result = evaluateFinanceChatTrace(
      evaluationCase,
      createTrace({ text: "今月の支出は¥9,000,000です。" }),
    );

    expect(result.violations).toContain(
      "最終回答に取得結果またはカードと一致しない金融 claim が含まれる",
    );
  });

  it("rejects final text links not returned by the navigation tool", () => {
    const result = evaluateFinanceChatTrace(
      evaluationCase,
      createTrace({ text: "[詳細](https://example.com)を確認してください。" }),
    );

    expect(result.violations).toContain(
      "ナビゲーションツール未検証の本文リンク: https://example.com",
    );
  });

  it("preserves transaction record associations", () => {
    const transactionCase: FinanceChatEvaluationCase = {
      ...categoryEvaluationCase,
      expectedCardTypes: ["transactionList"],
    };
    const mixedCards = [
      {
        type: "transactionList" as const,
        title: "明細",
        transactions: [
          {
            id: "transaction-a",
            date: "2026-07-10",
            description: "店舗 B",
            category: "食費",
            amount: 2_000,
            amountType: "expense" as const,
          },
        ],
        href,
      },
    ];
    const base = createTrace();
    const result = evaluateFinanceChatTrace(transactionCase, {
      text: "明細を表示します。",
      steps: [
        {
          toolCalls: [
            {
              toolCallId: "data",
              toolName: "searchTransactions",
              input: { month: "2026-07", category: "食費", type: "expense" },
            },
          ],
          toolResults: [
            {
              toolCallId: "data",
              toolName: "searchTransactions",
              output: [
                {
                  id: "transaction-a",
                  date: "2026-07-10",
                  description: "店舗 A",
                  category: "食費",
                  amount: 1_000,
                  type: "expense",
                },
                {
                  id: "transaction-b",
                  date: "2026-07-11",
                  description: "店舗 B",
                  category: "食費",
                  amount: 2_000,
                  type: "expense",
                },
              ],
            },
          ],
        },
        base.steps[1]!,
        {
          toolCalls: [
            {
              toolCallId: "presentation",
              toolName: "presentFinanceCards",
              input: { cards: mixedCards },
            },
          ],
          toolResults: [
            {
              toolCallId: "presentation",
              toolName: "presentFinanceCards",
              output: mixedCards,
            },
          ],
        },
      ],
    });

    expect(result.violations).toContain(
      "カード内容に取得結果で根拠付けられない金融 claim が含まれる",
    );
  });

  it("preserves category amount and percentage associations", () => {
    const categoryCase: FinanceChatEvaluationCase = {
      ...categoryEvaluationCase,
      expectedCardTypes: ["categoryBreakdown"],
    };
    const mixedCards = [
      {
        type: "categoryBreakdown" as const,
        title: "カテゴリ別支出",
        categories: [
          {
            name: "食費",
            amount: 2_000,
            amountType: "expense" as const,
            percentage: 66.66666666666666,
          },
        ],
        href,
      },
    ];
    const base = createTrace();
    const result = evaluateFinanceChatTrace(categoryCase, {
      text: "カテゴリ別支出です。",
      steps: [
        {
          toolCalls: [
            {
              toolCallId: "data",
              toolName: "searchTransactions",
              input: { month: "2026-07", category: "食費", type: "expense" },
            },
          ],
          toolResults: [
            {
              toolCallId: "data",
              toolName: "searchTransactions",
              output: [
                { category: "食費", totalAmount: 1_000, type: "expense" },
                { category: "交通費", totalAmount: 2_000, type: "expense" },
              ],
            },
          ],
        },
        base.steps[1]!,
        {
          toolCalls: [
            {
              toolCallId: "presentation",
              toolName: "presentFinanceCards",
              input: { cards: mixedCards },
            },
          ],
          toolResults: [
            {
              toolCallId: "presentation",
              toolName: "presentFinanceCards",
              output: mixedCards,
            },
          ],
        },
      ],
    });

    expect(result.violations).toContain(
      "カード内容に取得結果で根拠付けられない金融 claim が含まれる",
    );
  });

  it("keeps currency and percentage claims separate", () => {
    const base = createTrace();
    const dataStep = base.steps[0]!;
    const result = evaluateFinanceChatTrace(evaluationCase, {
      ...base,
      text: "今月の支出は20円です。",
      steps: [
        {
          ...dataStep,
          toolResults: dataStep.toolResults.map((toolResult) => ({
            ...toolResult,
            output: { income: 300_000, expense: 250_000, savingsRate: 20 },
          })),
        },
        ...base.steps.slice(1),
      ],
    });

    expect(result.violations).toContain(
      "最終回答に取得結果またはカードと一致しない金融 claim が含まれる",
    );
  });

  it("rejects unsupported arithmetic combinations", () => {
    const sum = evaluateFinanceChatTrace(
      evaluationCase,
      createTrace({ text: "今月の合計は550,000円です。" }),
    );
    const base = createTrace();
    const dataStep = base.steps[0]!;
    const selfDivision = evaluateFinanceChatTrace(evaluationCase, {
      ...base,
      text: "達成率は100%です。",
      steps: [
        {
          ...dataStep,
          toolResults: dataStep.toolResults.map((toolResult) => ({
            ...toolResult,
            output: { income: 300_000, expense: 250_000, savingsRate: 20 },
          })),
        },
        ...base.steps.slice(1),
      ],
    });

    expect(sum.violations).toContain(
      "最終回答に取得結果またはカードと一致しない金融 claim が含まれる",
    );
    expect(selfDivision.violations).toContain(
      "最終回答に取得結果またはカードと一致しない金融 claim が含まれる",
    );
  });

  it("derives category percentages within each amount type", () => {
    const mixedCategoryCase: FinanceChatEvaluationCase = {
      ...categoryEvaluationCase,
      toolStrategies: [[{ name: "getMonthlyCategoryTotals", input: { month: "2026-07" } }]],
      allowedDataTools: ["getMonthlyCategoryTotals"],
      expectedCardTypes: ["categoryBreakdown"],
    };
    const categoryCards = [
      {
        type: "categoryBreakdown" as const,
        title: "カテゴリ別支出",
        categories: [
          {
            name: "食費",
            amount: 1_000,
            amountType: "expense" as const,
            percentage: 33.33,
          },
        ],
        href,
      },
    ];
    const base = createTrace();
    const result = evaluateFinanceChatTrace(mixedCategoryCase, {
      text: "カテゴリ別支出です。",
      steps: [
        {
          toolCalls: [
            {
              toolCallId: "data",
              toolName: "getMonthlyCategoryTotals",
              input: { month: "2026-07" },
            },
          ],
          toolResults: [
            {
              toolCallId: "data",
              toolName: "getMonthlyCategoryTotals",
              output: [
                { category: "給与", totalAmount: 10_000, type: "income" },
                { category: "食費", totalAmount: 1_000, type: "expense" },
                { category: "交通費", totalAmount: 2_000, type: "expense" },
              ],
            },
          ],
        },
        base.steps[1]!,
        {
          toolCalls: [
            {
              toolCallId: "presentation",
              toolName: "presentFinanceCards",
              input: { cards: categoryCards },
            },
          ],
          toolResults: [
            {
              toolCallId: "presentation",
              toolName: "presentFinanceCards",
              output: categoryCards,
            },
          ],
        },
      ],
    });

    expect(result.passed).toBe(true);
  });

  it("rejects summary amounts assigned to the wrong financial type or label", () => {
    const base = createTrace();
    const wrongTypeCards = cards.map((card) =>
      card.type === "summary"
        ? {
            ...card,
            metrics: [{ label: "支出", amount: 300_000, amountType: "expense" as const }],
          }
        : card,
    );
    const wrongLabelCards = cards.map((card) =>
      card.type === "summary"
        ? {
            ...card,
            metrics: [{ label: "収入", amount: 250_000, amountType: "expense" as const }],
          }
        : card,
    );
    const evaluateCards = (replacementCards: FinanceChatCard[]) =>
      evaluateFinanceChatTrace(evaluationCase, {
        ...base,
        text: "今月の状況です。",
        steps: [
          ...base.steps.slice(0, 2),
          {
            toolCalls: [
              {
                toolCallId: "presentation",
                toolName: "presentFinanceCards",
                input: { cards: replacementCards },
              },
            ],
            toolResults: [
              {
                toolCallId: "presentation",
                toolName: "presentFinanceCards",
                output: replacementCards,
              },
            ],
          },
        ],
      });

    expect(evaluateCards(wrongTypeCards).violations).toContain(
      "カード内容に取得結果で根拠付けられない金融 claim が含まれる",
    );
    expect(evaluateCards(wrongLabelCards).violations).toContain(
      "カード内容に取得結果で根拠付けられない金融 claim が含まれる",
    );
  });

  it("parses compound Japanese currency expressions as single claims", () => {
    const base = createTrace();
    const compoundCards = cards.map((card) =>
      card.type === "summary"
        ? { ...card, metrics: [{ ...card.metrics[0]!, amount: 15_000 }] }
        : card,
    );
    const result = evaluateFinanceChatTrace(evaluationCase, {
      text: "収入は12万3,000円、収支は1万5千円です。",
      steps: [
        {
          ...base.steps[0]!,
          toolResults: [
            {
              toolCallId: "data",
              toolName: "getLatestMonthlySummary",
              output: { income: 123_000, expense: 108_000 },
            },
          ],
        },
        base.steps[1]!,
        {
          toolCalls: [
            {
              toolCallId: "presentation",
              toolName: "presentFinanceCards",
              input: { cards: compoundCards },
            },
          ],
          toolResults: [
            {
              toolCallId: "presentation",
              toolName: "presentFinanceCards",
              output: compoundCards,
            },
          ],
        },
      ],
    });

    expect(result.passed).toBe(true);
  });
});
