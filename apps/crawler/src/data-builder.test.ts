import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { buildScrapedData, buildGroupOnlyScrapedData } from "./data-builder.js";
import type { GlobalData, GroupData } from "./scraper.js";

// テスト用のモックデータ
const mockGlobalData: GlobalData = {
  registeredAccounts: {
    accounts: [
      {
        mfId: "acc1",
        name: "テスト銀行",
        type: "自動連携",
        status: "ok",
        lastUpdated: "2025-04-01",
        url: "/accounts/show/acc1",
        totalAssets: 1000000,
      },
      {
        mfId: "acc2",
        name: "テスト証券",
        type: "自動連携",
        status: "ok",
        lastUpdated: "2025-04-01",
        url: "/accounts/show/acc2",
        totalAssets: 2000000,
      },
    ],
  },
  portfolio: {
    items: [
      {
        name: "投資信託A",
        type: "投資信託",
        institution: "テスト証券",
        balance: 500000,
        quantity: 100,
        unitPrice: 5000,
      },
    ],
    totalAssets: 500000,
  },
  liabilities: {
    items: [
      {
        name: "住宅ローン",
        category: "住宅ローン",
        institution: "テスト銀行",
        balance: 10000000,
      },
    ],
    totalLiabilities: 10000000,
  },
  cashFlow: {
    month: "2025-04",
    totalIncome: 300000,
    totalExpense: 200000,
    balance: 100000,
    items: [
      {
        mfId: "tx1",
        date: "2025-04-15",
        category: "食費",
        subCategory: null,
        description: "スーパー",
        amount: 5000,
        type: "expense",
        isTransfer: false,
        isExcludedFromCalculation: false,
      },
    ],
  },
  refreshResult: {
    completed: true,
    incompleteAccounts: [],
  },
};

const mockGroupData: GroupData = {
  group: {
    id: "g1",
    name: "テスト家族",
    isCurrent: true,
  },
  registeredAccounts: {
    accounts: [
      {
        mfId: "acc1",
        name: "テスト銀行",
        type: "自動連携",
        status: "ok",
        lastUpdated: "2025-04-01",
        url: "/accounts/show/acc1",
        totalAssets: 1000000,
      },
    ],
  },
  assetHistory: {
    points: [
      {
        date: "2025-04-01",
        totalAssets: 3000000,
        change: 50000,
        categories: { 預金: 1000000, 投資: 2000000 },
      },
    ],
  },
  spendingTargets: {
    categories: [
      {
        largeCategoryId: 1,
        name: "食費",
        type: "variable",
      },
    ],
  },
  summary: {
    totalAssets: "3,000,000",
    dailyChange: "+50,000",
    dailyChangePercent: "+1.7%",
    monthlyChange: "+100,000",
    monthlyChangePercent: "+3.4%",
  },
  items: [
    {
      name: "預金",
      balance: "1,000,000",
      previousBalance: "950,000",
      change: "+50,000",
    },
  ],
};

describe("buildScrapedData", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-04-29T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("GlobalDataとGroupDataを正しく結合する", () => {
    const result = buildScrapedData(mockGlobalData, mockGroupData);

    // GlobalDataからのフィールド
    expect(result.cashFlow).toBe(mockGlobalData.cashFlow);
    expect(result.portfolio).toBe(mockGlobalData.portfolio);
    expect(result.liabilities).toBe(mockGlobalData.liabilities);
    expect(result.registeredAccounts).toBe(mockGlobalData.registeredAccounts);
    expect(result.refreshResult).toBe(mockGlobalData.refreshResult);

    // GroupDataからのフィールド
    expect(result.summary).toBe(mockGroupData.summary);
    expect(result.items).toBe(mockGroupData.items);
    expect(result.assetHistory).toBe(mockGroupData.assetHistory);
    expect(result.spendingTargets).toBe(mockGroupData.spendingTargets);
    expect(result.currentGroup).toBe(mockGroupData.group);
  });

  test("updatedAtが設定される", () => {
    const result = buildScrapedData(mockGlobalData, mockGroupData);

    expect(result.updatedAt).toBeTruthy();
    expect(result.updatedAt).toContain("2025");
  });
});

describe("buildGroupOnlyScrapedData", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-04-29T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("GroupDataからScrapedDataを構築する", () => {
    const result = buildGroupOnlyScrapedData(mockGroupData);

    // GroupDataからのフィールド
    expect(result.summary).toBe(mockGroupData.summary);
    expect(result.items).toBe(mockGroupData.items);
    expect(result.assetHistory).toBe(mockGroupData.assetHistory);
    expect(result.spendingTargets).toBe(mockGroupData.spendingTargets);
    expect(result.registeredAccounts).toBe(mockGroupData.registeredAccounts);
    expect(result.currentGroup).toBe(mockGroupData.group);
  });

  test("cashFlowが空のデフォルト値になる", () => {
    const result = buildGroupOnlyScrapedData(mockGroupData);

    expect(result.cashFlow.month).toBe("");
    expect(result.cashFlow.totalIncome).toBe(0);
    expect(result.cashFlow.totalExpense).toBe(0);
    expect(result.cashFlow.balance).toBe(0);
    expect(result.cashFlow.items).toEqual([]);
  });

  test("portfolioが空のデフォルト値になる", () => {
    const result = buildGroupOnlyScrapedData(mockGroupData);

    expect(result.portfolio.items).toEqual([]);
    expect(result.portfolio.totalAssets).toBe(0);
  });

  test("liabilitiesが空のデフォルト値になる", () => {
    const result = buildGroupOnlyScrapedData(mockGroupData);

    expect(result.liabilities.items).toEqual([]);
    expect(result.liabilities.totalLiabilities).toBe(0);
  });

  test("refreshResultがnullになる", () => {
    const result = buildGroupOnlyScrapedData(mockGroupData);

    expect(result.refreshResult).toBeNull();
  });

  test("updatedAtが設定される", () => {
    const result = buildGroupOnlyScrapedData(mockGroupData);

    expect(result.updatedAt).toBeTruthy();
    expect(result.updatedAt).toContain("2025");
  });
});
