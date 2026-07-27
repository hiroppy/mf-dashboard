import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { describe, test, expect, beforeAll, beforeEach, afterAll } from "vitest";
import * as schema from "../schema/schema";
import { closeTestDb, createTestDb, resetTestDb } from "../test-helpers";
import type { ScrapedData } from "../types";
import {
  normalizePortfolioCategories,
  saveGroupOnlyData,
  saveScrapedData,
  saveScrapedDataBatch,
} from "./save-scraped-data";

type Db = Awaited<ReturnType<typeof createTestDb>>;

let db: Db;
let temporaryDirectory: string;

beforeAll(async () => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "mf-dashboard-save-scraped-data-"));
  db = await createTestDb(`file:${join(temporaryDirectory, "test.db")}`);
});

afterAll(() => {
  closeTestDb(db);
  rmSync(temporaryDirectory, { recursive: true });
});

beforeEach(async () => {
  await resetTestDb(db);
});

function createScrapedData(): ScrapedData {
  return {
    summary: {
      totalAssets: "1,234,500",
      dailyChange: "+120",
      dailyChangePercent: "+0.01%",
      monthlyChange: "+1,000",
      monthlyChangePercent: "+0.08%",
    },
    items: [],
    cashFlow: {
      month: "2026-07",
      totalIncome: 0,
      totalExpense: 0,
      balance: 0,
      items: [],
    },
    portfolio: {
      totalAssets: 1234500,
      items: [
        {
          name: "Fund A",
          type: "投資信託",
          institution: "Institution A",
          balance: 1234500,
          quantity: 52.3491,
          unitPrice: 12345,
          avgCostPrice: 10000,
          dailyChange: 120,
          unrealizedGain: 234500,
          unrealizedGainPct: 23.45,
        },
      ],
    },
    liabilities: { totalLiabilities: 0, items: [] },
    assetHistory: { points: [] },
    registeredAccounts: {
      accounts: [
        {
          mfId: "account-a",
          name: "Institution A",
          type: "自動連携",
          status: "ok",
          lastUpdated: "2026-07-17",
          url: "",
          totalAssets: 1234500,
        },
      ],
    },
    spendingTargets: null,
    currentGroup: { id: "group-a", name: "Group A", isCurrent: true },
    refreshResult: { completed: true, incompleteAccounts: [] },
    updatedAt: "2026-07-17T00:00:00.000Z",
  };
}

describe("normalizePortfolioCategories", () => {
  const registeredAccounts: ScrapedData["registeredAccounts"] = {
    accounts: [
      {
        mfId: "bank-a",
        name: "Bank A",
        type: "自動連携",
        status: "ok",
        lastUpdated: "2026-07-17",
        url: "",
        totalAssets: 100000,
      },
      {
        mfId: "crypto-a",
        name: "Crypto Account A",
        type: "自動連携",
        status: "ok",
        lastUpdated: "2026-07-17",
        url: "",
        totalAssets: 200000,
      },
    ],
  };

  test("公式口座カテゴリに従って預金と暗号資産を分類する", () => {
    const portfolio = {
      totalAssets: 300000,
      items: [
        {
          name: "Deposit A",
          type: "預金・現金",
          institution: "Bank A",
          balance: 100000,
        },
        {
          accountMfId: "crypto-a",
          name: "Crypto Asset A",
          type: "預金・現金",
          institution: "Different Display Name",
          balance: 200000,
        },
      ],
    };

    const result = normalizePortfolioCategories(
      portfolio,
      registeredAccounts,
      new Map([
        ["bank-a", "銀行"],
        ["crypto-a", "暗号資産・FX・貴金属"],
      ]),
    );

    expect(result.items).toEqual([
      expect.objectContaining({ name: "Deposit A", type: "預金・現金" }),
      expect.objectContaining({ name: "Crypto Asset A", type: "暗号資産" }),
    ]);
  });

  test("預金以外のカテゴリは口座カテゴリなしでも変更しない", () => {
    const portfolio = {
      totalAssets: 200000,
      items: [
        {
          name: "Crypto Asset A",
          type: "暗号資産",
          institution: "",
          balance: 200000,
        },
      ],
    };

    expect(normalizePortfolioCategories(portfolio, registeredAccounts)).toEqual(portfolio);
  });

  test.each([
    {
      name: "口座が取得対象外",
      portfolioAccountMfId: "stale-account",
      institution: "",
      institutionCategories: new Map([["stale-account", "暗号資産・FX・貴金属"]]),
    },
    {
      name: "公式口座カテゴリがない",
      portfolioAccountMfId: "crypto-a",
      institution: "",
      institutionCategories: new Map<string, string>(),
    },
  ])(
    "$nameの場合は預金を分類せず保存しない",
    ({ portfolioAccountMfId, institution, institutionCategories }) => {
      const portfolio = {
        totalAssets: 100000,
        items: [
          {
            accountMfId: portfolioAccountMfId,
            name: "Asset A",
            type: "預金・現金",
            institution,
            balance: 100000,
          },
        ],
      };

      expect(() =>
        normalizePortfolioCategories(portfolio, registeredAccounts, institutionCategories),
      ).toThrow("Cannot classify a deposit");
    },
  );

  test("同名口座が複数ある場合は名称で推測しない", () => {
    const duplicateAccounts = {
      accounts: [
        registeredAccounts.accounts[0]!,
        { ...registeredAccounts.accounts[1]!, name: "Bank A" },
      ],
    };
    const portfolio = {
      totalAssets: 100000,
      items: [
        {
          name: "Asset A",
          type: "預金・現金",
          institution: "Bank A",
          balance: 100000,
        },
      ],
    };

    expect(() =>
      normalizePortfolioCategories(
        portfolio,
        duplicateAccounts,
        new Map([
          ["bank-a", "銀行"],
          ["crypto-a", "暗号資産・FX・貴金属"],
        ]),
      ),
    ).toThrow("Cannot classify a deposit");
  });
});

describe("saveScrapedData", () => {
  test("ポートフォリオの全詳細フィールドを保持して保存する", async () => {
    const data = createScrapedData();

    await saveScrapedData(db, data);

    const holdings = await db.select().from(schema.holdings).all();
    const values = await db.select().from(schema.holdingValues).all();

    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toMatchObject({ name: "Fund A", type: "asset" });
    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({
      amount: 1234500,
      quantity: 52.3491,
      unitPrice: 12345,
      avgCostPrice: 10000,
      dailyChange: 120,
      unrealizedGain: 234500,
      unrealizedGainPct: 23.45,
    });
  });

  test("預金カテゴリは公式口座カテゴリなしで保存しない", async () => {
    const data = createScrapedData();
    data.portfolio.items[0]!.type = "預金・現金";

    await expect(saveScrapedData(db, data)).rejects.toThrow("Cannot classify a deposit");
    await expect(db.select().from(schema.holdings).all()).resolves.toEqual([]);
  });

  test("accountMfIdが今回取得した口座と一致する手入力資産を紐づける", async () => {
    const data = createScrapedData();
    data.registeredAccounts.accounts.push({
      mfId: "manual-account-a",
      name: "Manual Account A",
      type: "手動",
      status: "ok",
      lastUpdated: "2026-07-17",
      url: "",
      totalAssets: 500000,
    });
    data.portfolio.items.push({
      accountMfId: "manual-account-a",
      name: "Manual Asset A",
      type: "保険",
      institution: "",
      balance: 500000,
    });

    await saveScrapedData(db, data);

    const manualAccount = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.mfId, "manual-account-a"))
      .get();
    const manualHolding = await db
      .select()
      .from(schema.holdings)
      .where(eq(schema.holdings.name, "Manual Asset A"))
      .get();

    expect(manualHolding?.accountId).toBe(manualAccount?.id);
    await expect(
      db
        .select()
        .from(schema.groupAccounts)
        .where(eq(schema.groupAccounts.accountId, manualAccount!.id))
        .get(),
    ).resolves.toMatchObject({ groupId: "group-a" });
  });

  test("通常口座詳細由来の年金をaccountMfIdで自動連携口座へ紐づける", async () => {
    const data = createScrapedData();
    data.portfolio.items.push({
      accountMfId: "account-a",
      name: "Pension A",
      type: "年金",
      institution: "",
      balance: 500000,
    });

    await saveScrapedData(db, data);

    const linkedAccount = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.mfId, "account-a"))
      .get();
    const pensionHolding = await db
      .select()
      .from(schema.holdings)
      .where(eq(schema.holdings.name, "Pension A"))
      .get();

    expect(pensionHolding?.accountId).toBe(linkedAccount?.id);
  });

  test("accountMfIdを金融機関名より優先する", async () => {
    const data = createScrapedData();
    data.registeredAccounts.accounts.push({
      mfId: "manual-account-a",
      name: "Manual Account A",
      type: "手動",
      status: "ok",
      lastUpdated: "2026-07-17",
      url: "",
      totalAssets: 500000,
    });
    data.portfolio.items.push({
      accountMfId: "manual-account-a",
      name: "Manual Asset A",
      type: "保険",
      institution: "Institution A",
      balance: 500000,
    });

    await saveScrapedData(db, data);

    const manualAccount = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.mfId, "manual-account-a"))
      .get();
    const manualHolding = await db
      .select()
      .from(schema.holdings)
      .where(eq(schema.holdings.name, "Manual Asset A"))
      .get();

    expect(manualHolding?.accountId).toBe(manualAccount?.id);
  });

  test("accountMfIdがない資産は同名の登録口座へ推測で紐づけない", async () => {
    const data = createScrapedData();
    data.registeredAccounts.accounts.push({
      mfId: "manual-account-a",
      name: "Manual Asset A",
      type: "手動",
      status: "ok",
      lastUpdated: "2026-07-17",
      url: "",
      totalAssets: 500000,
    });
    data.portfolio.items.push({
      name: "Manual Asset A",
      type: "保険",
      institution: "",
      balance: 500000,
    });

    await saveScrapedData(db, data);

    const fallbackAccount = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.mfId, "unknown"))
      .get();
    const unmatchedHolding = await db
      .select()
      .from(schema.holdings)
      .where(eq(schema.holdings.name, "Manual Asset A"))
      .get();

    expect(unmatchedHolding?.accountId).toBe(fallbackAccount?.id);
  });

  test("未登録の金融機関名がある資産は同名口座へ誤って紐づけない", async () => {
    const data = createScrapedData();
    data.registeredAccounts.accounts.push({
      mfId: "manual-account-a",
      name: "Manual Account A",
      type: "手動",
      status: "ok",
      lastUpdated: "2026-07-17",
      url: "",
      totalAssets: 0,
    });
    data.portfolio.items.push({
      name: "Manual Account A",
      type: "保険",
      institution: "Unregistered Institution A",
      balance: 500000,
    });

    await saveScrapedData(db, data);

    const fallbackAccount = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.mfId, "unknown"))
      .get();
    const unmatchedHolding = await db
      .select()
      .from(schema.holdings)
      .where(eq(schema.holdings.name, "Manual Account A"))
      .get();

    expect(unmatchedHolding?.accountId).toBe(fallbackAccount?.id);
  });

  test("今回の取得対象外にある旧accountMfIdへ手入力資産を紐づけない", async () => {
    const now = new Date().toISOString();
    await db.insert(schema.accounts).values({
      mfId: "stale-account-a",
      name: "Manual Account A",
      type: "手動",
      createdAt: now,
      updatedAt: now,
    });
    const data = createScrapedData();
    data.portfolio.items.push({
      accountMfId: "stale-account-a",
      name: "Manual Asset A",
      type: "保険",
      institution: "Institution A",
      balance: 500000,
    });

    await saveScrapedData(db, data);

    const fallbackAccount = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.mfId, "unknown"))
      .get();
    const unmatchedHolding = await db
      .select()
      .from(schema.holdings)
      .where(eq(schema.holdings.name, "Manual Asset A"))
      .get();

    expect(unmatchedHolding?.accountId).toBe(fallbackAccount?.id);
  });

  test("同名の登録口座が複数ある場合は手入力資産をどちらにも紐づけない", async () => {
    const data = createScrapedData();
    data.registeredAccounts.accounts.push(
      {
        mfId: "manual-account-a",
        name: "Shared Account",
        type: "手動",
        status: "ok",
        lastUpdated: "2026-07-17",
        url: "",
        totalAssets: 250000,
      },
      {
        mfId: "manual-account-b",
        name: "Shared Account",
        type: "手動",
        status: "ok",
        lastUpdated: "2026-07-17",
        url: "",
        totalAssets: 250000,
      },
    );
    data.portfolio.items.push({
      name: "Shared Account",
      type: "保険",
      institution: "",
      balance: 500000,
    });

    await saveScrapedData(db, data);

    const fallbackAccount = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.mfId, "unknown"))
      .get();
    const unmatchedHolding = await db
      .select()
      .from(schema.holdings)
      .where(eq(schema.holdings.name, "Shared Account"))
      .get();

    expect(unmatchedHolding?.accountId).toBe(fallbackAccount?.id);
  });

  test("金融機関名がない手入力負債を同名の登録口座へ推測で紐づけない", async () => {
    const data = createScrapedData();
    data.registeredAccounts.accounts.push({
      mfId: "manual-liability-a",
      name: "Manual Liability A",
      type: "手動",
      status: "ok",
      lastUpdated: "2026-07-17",
      url: "",
      totalAssets: 0,
    });
    data.liabilities.items.push({
      name: "Manual Liability A",
      category: "ローン",
      institution: "",
      balance: 300000,
    });

    await saveScrapedData(db, data);

    const manualAccount = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.mfId, "manual-liability-a"))
      .get();
    const manualHolding = await db
      .select()
      .from(schema.holdings)
      .where(eq(schema.holdings.name, "Manual Liability A"))
      .get();

    const fallbackAccount = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.mfId, "unknown"))
      .get();

    expect(manualHolding?.accountId).not.toBe(manualAccount?.id);
    expect(manualHolding?.accountId).toBe(fallbackAccount?.id);
  });

  test("保存途中に失敗した場合は公開対象をすべてrollbackする", async () => {
    const data = createScrapedData();
    data.spendingTargets = {
      categories: [
        {
          largeCategoryId: undefined as unknown as number,
          name: "Category A",
          type: "fixed",
        },
      ],
    };

    await expect(saveScrapedData(db, data)).rejects.toThrow(/spending_targets/);

    await expect(db.select().from(schema.groups).all()).resolves.toEqual([]);
    await expect(db.select().from(schema.groupAccounts).all()).resolves.toEqual([]);
    await expect(db.select().from(schema.dailySnapshots).all()).resolves.toEqual([]);
    await expect(db.select().from(schema.holdingValues).all()).resolves.toEqual([]);
  });

  test("group-only保存も途中に失敗した場合はすべてrollbackする", async () => {
    const data = createScrapedData();
    data.spendingTargets = {
      categories: [
        {
          largeCategoryId: undefined as unknown as number,
          name: "Category A",
          type: "fixed",
        },
      ],
    };

    await expect(saveGroupOnlyData(db, data)).rejects.toThrow(/spending_targets/);

    await expect(db.select().from(schema.groups).all()).resolves.toEqual([]);
    await expect(db.select().from(schema.groupAccounts).all()).resolves.toEqual([]);
  });

  test("full保存後のgroup-only保存失敗時もcrawl全体をrollbackする", async () => {
    const fullData = createScrapedData();
    const groupData = createScrapedData();
    groupData.currentGroup = { id: "group-b", name: "Group B", isCurrent: false };
    groupData.spendingTargets = {
      categories: [
        {
          largeCategoryId: undefined as unknown as number,
          name: "Category A",
          type: "fixed",
        },
      ],
    };

    await expect(
      saveScrapedDataBatch(db, { fullData, groupOnlyData: [groupData] }),
    ).rejects.toThrow(/spending_targets/);

    await expect(db.select().from(schema.groups).all()).resolves.toEqual([]);
    await expect(db.select().from(schema.groupAccounts).all()).resolves.toEqual([]);
    await expect(db.select().from(schema.dailySnapshots).all()).resolves.toEqual([]);
    await expect(db.select().from(schema.holdingValues).all()).resolves.toEqual([]);
  });

  test("stale group cleanupをcurrent dataと同じtransactionで公開する", async () => {
    await db.insert(schema.groups).values({
      id: "stale-group",
      name: "Stale Group",
      isCurrent: false,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });

    await saveScrapedDataBatch(db, {
      cleanupGroupIds: ["group-a"],
      fullData: createScrapedData(),
      groupOnlyData: [],
    });

    await expect(db.select().from(schema.groups).all()).resolves.toEqual([
      expect.objectContaining({ id: "group-a" }),
    ]);
  });

  test("institution category更新をrefresh transaction失敗時にrollbackする", async () => {
    const fullData = createScrapedData();
    await saveScrapedData(db, fullData);
    await saveScrapedDataBatch(db, {
      fullData,
      groupOnlyData: [],
      institutionCategories: new Map([["account-a", "銀行"]]),
    });
    const [bankCategory] = await db.select().from(schema.institutionCategories).all();
    expect(bankCategory).toEqual(expect.objectContaining({ name: "銀行" }));

    await expect(
      saveScrapedDataBatch(db, {
        fullData,
        groupOnlyData: [],
        institutionCategories: new Map([["account-a", "証券"]]),
        historyMonths: [
          {
            month: "2026-06",
            items: [
              {
                mfId: "invalid-history",
                date: "2026-06-01",
                category: "Category A",
                subCategory: null,
                description: "Transaction A",
                amount: undefined as unknown as number,
                type: "expense",
                isTransfer: false,
                isExcludedFromCalculation: false,
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow(/transactions/);

    await expect(db.select().from(schema.accounts).all()).resolves.toContainEqual(
      expect.objectContaining({ mfId: "account-a", categoryId: bankCategory?.id }),
    );
    await expect(db.select().from(schema.institutionCategories).all()).resolves.toEqual([
      bankCategory,
    ]);
  });

  test("後続の履歴月保存失敗時もcurrent dataと先行月をrollbackする", async () => {
    const fullData = createScrapedData();
    await db.insert(schema.groups).values({
      id: "stale-group",
      name: "Stale Group",
      isCurrent: false,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    const item = {
      mfId: "history-a",
      date: "2026-05-01",
      category: "Category A",
      subCategory: null,
      description: "Transaction A",
      amount: 1_000,
      type: "expense" as const,
      isTransfer: false,
      isExcludedFromCalculation: false,
    };

    await expect(
      saveScrapedDataBatch(db, {
        cleanupGroupIds: ["group-a"],
        fullData,
        groupOnlyData: [],
        historyMonths: [
          { month: "2026-05", items: [item] },
          {
            month: "2026-06",
            items: [{ ...item, mfId: "history-b", amount: undefined as unknown as number }],
          },
        ],
      }),
    ).rejects.toThrow(/transactions/);

    await expect(db.select().from(schema.groups).all()).resolves.toEqual([
      expect.objectContaining({ id: "stale-group" }),
    ]);
    await expect(db.select().from(schema.transactions).all()).resolves.toEqual([]);
    await expect(db.select().from(schema.dailySnapshots).all()).resolves.toEqual([]);
  });
});
