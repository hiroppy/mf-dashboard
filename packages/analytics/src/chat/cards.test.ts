import { describe, expect, it } from "vitest";
import { buildFinanceChatHref, financeChatCardSchema, financeChatHrefSchema } from "./cards.js";

describe("financeChatHrefSchema", () => {
  it.each(["/", "/cf", "/cf/2026-07", "/group-a/accounts/account-1", "/group-a/insights"])(
    "accepts supported internal route %s",
    (href) => expect(financeChatHrefSchema.safeParse(href).success).toBe(true),
  );

  it.each([
    "https://example.com",
    "//example.com",
    "/cf/2026-13",
    "/unknown/detail",
    "/group-a/unknown",
    "/group-a/cf/2026-07/extra",
    "/accounts/%2e%2e",
    "/cf?month=2026-07",
  ])("rejects unsupported or unsafe route %s", (href) => {
    expect(financeChatHrefSchema.safeParse(href).success).toBe(false);
  });
});

describe("buildFinanceChatHref", () => {
  it("builds routes from trusted page and parameter values", () => {
    expect(buildFinanceChatHref({ page: "dashboard", groupId: "group-a" })).toBe("/group-a");
    expect(buildFinanceChatHref({ page: "cashFlow", groupId: "group-a", month: "2026-07" })).toBe(
      "/group-a/cf/2026-07",
    );
    expect(buildFinanceChatHref({ page: "accounts", accountId: "account 1" })).toBe(
      "/accounts/account%201",
    );
  });

  it("rejects traversal and invalid month parameters", () => {
    expect(() => buildFinanceChatHref({ page: "dashboard", groupId: ".." })).toThrow(
      "Invalid route segment",
    );
    expect(() => buildFinanceChatHref({ page: "cashFlow", month: "2026-13" })).toThrow(
      "Invalid string",
    );
    expect(() => buildFinanceChatHref({ page: "accounts", accountId: "" })).toThrow("Too small");
  });

  it.each(["accounts", "bs", "cf", "insights", "simulator"])(
    "rejects the reserved group ID %s",
    (groupId) => {
      expect(() => buildFinanceChatHref({ page: "dashboard", groupId })).toThrow(
        "Reserved route segment",
      );
    },
  );
});

describe("financeChatCardSchema", () => {
  it("parses each supported card type", () => {
    const cards = [
      {
        type: "summary",
        title: "今月の収支",
        metrics: [{ label: "収支", amount: 12000, amountType: "balance" }],
      },
      {
        type: "transactionList",
        title: "最近の支出",
        transactions: [
          {
            id: "transaction-1",
            date: "2026-07-01",
            description: "店舗 A",
            amount: -1200,
            amountType: "expense",
          },
        ],
      },
      {
        type: "categoryBreakdown",
        title: "カテゴリ別支出",
        categories: [{ name: "食費", amount: -1200, amountType: "expense", percentage: 50 }],
      },
      {
        type: "chart",
        title: "収支推移",
        chartType: "line",
        series: [
          { name: "収入", amountType: "income" },
          { name: "支出", amountType: "expense" },
        ],
        data: [
          { label: "6月", values: [300000, 200000] },
          { label: "7月", values: [320000, 190000] },
        ],
      },
      { type: "insight", title: "支出傾向", description: "前月より減少しています" },
      {
        type: "action",
        title: "詳細を確認",
        description: "収支ページで確認できます",
        action: { label: "収支を見る", href: "/cf/2026-07" },
      },
      {
        type: "empty",
        title: "支出が見つかりません",
        description: "期間を変えて確認してください",
        prompts: ["今月の支出を見たい"],
      },
    ];

    for (const card of cards) expect(financeChatCardSchema.safeParse(card).success).toBe(true);
  });

  it("rejects an unsafe action and invalid numeric boundaries", () => {
    expect(
      financeChatCardSchema.safeParse({
        type: "action",
        title: "外部へ移動",
        description: "不正な URL",
        action: { label: "開く", href: "javascript:alert(1)" },
      }).success,
    ).toBe(false);
    expect(
      financeChatCardSchema.safeParse({
        type: "categoryBreakdown",
        title: "支出",
        categories: [{ name: "食費", amount: 100, amountType: "expense", percentage: 101 }],
      }).success,
    ).toBe(false);
    expect(
      financeChatCardSchema.safeParse({
        type: "transactionList",
        title: "取引",
        transactions: [
          {
            id: "transaction-1",
            date: "2026-02-30",
            description: "店舗 A",
            amount: -100,
            amountType: "expense",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      financeChatCardSchema.safeParse({
        type: "insight",
        title: "支出傾向",
        description: "支出が減少しました",
        amount: 1000,
      }).success,
    ).toBe(false);
    expect(
      financeChatCardSchema.safeParse({
        type: "insight",
        title: "削減候補",
        description: "食費を前月と比較しました",
        amount: 1000,
        amountType: "balance",
      }).success,
    ).toBe(false);
  });

  it("rejects chart data that does not match its series", () => {
    expect(
      financeChatCardSchema.safeParse({
        type: "chart",
        title: "収支推移",
        chartType: "line",
        series: [{ name: "収入", amountType: "income" }],
        data: [{ label: "7月", values: [300000, 200000] }],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate chart series names", () => {
    expect(
      financeChatCardSchema.safeParse({
        type: "chart",
        title: "年度別の支出比較",
        chartType: "line",
        series: [
          { name: "支出", amountType: "expense" },
          { name: "支出", amountType: "expense" },
        ],
        data: [{ label: "7月", values: [200000, 180000] }],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate chart data labels", () => {
    expect(
      financeChatCardSchema.safeParse({
        type: "chart",
        title: "支出内訳",
        chartType: "pie",
        series: [{ name: "支出", amountType: "expense" }],
        data: [
          { label: "その他", values: [3000] },
          { label: "その他", values: [2000] },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects negative pie chart values", () => {
    expect(
      financeChatCardSchema.safeParse({
        type: "chart",
        title: "支出内訳",
        chartType: "pie",
        series: [{ name: "支出", amountType: "expense" }],
        data: [{ label: "食費", values: [-3000] }],
      }).success,
    ).toBe(false);
  });

  it("rejects pie charts with more categories than the color palette", () => {
    const card = {
      type: "chart" as const,
      title: "支出内訳",
      chartType: "pie" as const,
      series: [{ name: "支出", amountType: "expense" as const }],
    };
    const data = (length: number) =>
      Array.from({ length }, (_, index) => ({
        label: `カテゴリ${index + 1}`,
        values: [index + 1],
      }));

    expect(financeChatCardSchema.safeParse({ ...card, data: data(5) }).success).toBe(true);
    expect(financeChatCardSchema.safeParse({ ...card, data: data(6) }).success).toBe(false);
  });

  it("rejects pie chart data whose values are all zero", () => {
    expect(
      financeChatCardSchema.safeParse({
        type: "chart",
        title: "支出内訳",
        chartType: "pie",
        series: [{ name: "支出", amountType: "expense" }],
        data: [
          { label: "食費", values: [0] },
          { label: "日用品", values: [0] },
        ],
      }).success,
    ).toBe(false);
  });
});
