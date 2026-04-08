import type { ScrapedData } from "@mf-dashboard/db/types";
import type { Browser, BrowserContext } from "playwright";
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { scrape } from "../../src/scraper.js";
import {
  gotoHome,
  launchLoggedInContext,
  saveScreenshot,
  withErrorScreenshot,
  withNewPage,
} from "./helpers.js";

let browser: Browser;
let context: BrowserContext;
let data: ScrapedData;

beforeAll(async () => {
  ({ browser, context } = await launchLoggedInContext());
  data = await withNewPage(context, async (page) => {
    // auth state で既にログイン済みなので、直接 ME に遷移
    await gotoHome(page);
    await saveScreenshot(page, "scraper-test-before-scrape.png");

    return withErrorScreenshot(page, "scraper-test-error.png", () =>
      scrape(page, { skipRefresh: true }),
    );
  });
});

afterAll(async () => {
  await context?.close();
  await browser?.close();
});

describe("currentGroup", () => {
  test("グループが取得できる", () => {
    expect(data.currentGroup).not.toBeNull();
    expect(data.currentGroup?.id).toBeTruthy();
    expect(data.currentGroup?.name).toBeTruthy();
  });
});

describe("assetSummary", () => {
  test("総資産が取得できる", () => {
    expect(data.summary.totalAssets).not.toBe("取得失敗");
  });

  test("前日比が取得できる", () => {
    // dailyChange は items の「合計」カテゴリの change から取得
    const totalItem = data.items.find((item) => item.name === "合計");
    expect(totalItem?.change).toBeTruthy();
  });
});

describe("assetItems", () => {
  test("カテゴリ別資産が取得できる", () => {
    expect(data.items.length).toBeGreaterThan(0);
  });

  test("各項目にカテゴリ名がある", () => {
    for (const item of data.items) {
      expect(item.name).toBeTruthy();
    }
  });

  test("各項目に残高がある", () => {
    for (const item of data.items) {
      expect(item.balance).toBeTruthy();
    }
  });
});

describe("portfolio", () => {
  test("ポートフォリオ項目が取得できる", () => {
    expect(data.portfolio.items.length).toBeGreaterThan(0);
  });

  test("総資産が正の値", () => {
    expect(data.portfolio.totalAssets).toBeGreaterThan(0);
  });

  test("各項目に名前・タイプがある", () => {
    for (const item of data.portfolio.items) {
      expect(item.name).toBeTruthy();
      expect(item.type).toBeTruthy();
    }
  });
});

describe("liabilities", () => {
  test("負債構造が取得できる", () => {
    expect(data.liabilities).toBeDefined();
    expect(Array.isArray(data.liabilities.items)).toBe(true);
  });

  test("負債項目があれば必須フィールドを持つ", () => {
    for (const item of data.liabilities.items) {
      expect(item.name).toBeTruthy();
      expect(item.category).toBeTruthy();
      expect(typeof item.balance).toBe("number");
    }
  });
});

describe("cashFlow", () => {
  test("月が取得できる", () => {
    expect(data.cashFlow.month).toBeTruthy();
  });

  test("収支合計が数値", () => {
    expect(typeof data.cashFlow.totalIncome).toBe("number");
    expect(typeof data.cashFlow.totalExpense).toBe("number");
  });

  test("取引一覧が取得できる", () => {
    expect(Array.isArray(data.cashFlow.items)).toBe(true);
  });

  test("取引に mfId がある", () => {
    const withMfId = data.cashFlow.items.filter((i) => !!i.mfId && !i.mfId.startsWith("unknown"));
    expect(withMfId.length).toBeGreaterThan(0);
  });
});

describe("assetHistory", () => {
  test("履歴ポイントが取得できる", () => {
    expect(data.assetHistory.points.length).toBeGreaterThan(0);
  });

  test("各ポイントに日付がある", () => {
    for (const point of data.assetHistory.points) {
      expect(point.date).toBeTruthy();
    }
  });
});

describe("registeredAccounts", () => {
  test("登録口座が取得できる", () => {
    expect(data.registeredAccounts.accounts.length).toBeGreaterThan(0);
  });

  test("各口座に名前がある", () => {
    for (const account of data.registeredAccounts.accounts) {
      expect(account.name).toBeTruthy();
    }
  });

  test("各口座に有効なタイプがある", () => {
    for (const account of data.registeredAccounts.accounts) {
      expect(["自動連携", "手動"]).toContain(account.type);
    }
  });

  test("各口座に有効なステータスがある", () => {
    for (const account of data.registeredAccounts.accounts) {
      expect(["ok", "error", "updating", "unknown", "suspended"]).toContain(account.status);
    }
  });
});

describe("spendingTargets", () => {
  test("予算データが取得できる", () => {
    expect(data.spendingTargets).not.toBeNull();
  });

  test("カテゴリ一覧がある", () => {
    expect(data.spendingTargets?.categories.length).toBeGreaterThan(0);
  });

  test("各カテゴリに必須フィールドがある", () => {
    for (const category of data.spendingTargets?.categories || []) {
      expect(category.largeCategoryId).toBeGreaterThan(0);
      expect(category.name).toBeTruthy();
      expect(["fixed", "variable"]).toContain(category.type);
    }
  });
});
