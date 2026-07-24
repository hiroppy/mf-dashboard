import { describe, test, expect, beforeAll, beforeEach, afterAll } from "vitest";
import * as schema from "../schema/schema";
import { closeTestDb, createTestDb, resetTestDb } from "../test-helpers";
import type { ScrapedData } from "../types";
import { saveScrapedData } from "./save-scraped-data";

type Db = Awaited<ReturnType<typeof createTestDb>>;

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(() => {
  closeTestDb(db);
});

beforeEach(async () => {
  await resetTestDb(db);
});

describe("saveScrapedData", () => {
  test("ポートフォリオの全詳細フィールドを保持して保存する", async () => {
    const data: ScrapedData = {
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
});
