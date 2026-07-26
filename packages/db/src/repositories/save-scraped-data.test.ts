import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { describe, test, expect, beforeAll, beforeEach, afterAll } from "vitest";
import * as schema from "../schema/schema";
import { closeTestDb, createTestDb, resetTestDb } from "../test-helpers";
import type { ScrapedData } from "../types";
import { saveGroupOnlyData, saveScrapedData, saveScrapedDataBatch } from "./save-scraped-data";

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

  test("金融機関名がない手入力資産を同名の登録口座へ紐づける", async () => {
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
      name: "Manual Account A",
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
      .where(eq(schema.holdings.name, "Manual Account A"))
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

  test("金融機関名がない手入力負債を同名の登録口座へ紐づける", async () => {
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

    expect(manualHolding?.accountId).toBe(manualAccount?.id);
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
