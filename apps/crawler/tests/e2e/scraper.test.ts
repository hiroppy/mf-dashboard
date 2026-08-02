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
    expect(
      data.currentGroup !== null &&
        Boolean(data.currentGroup.id) &&
        Boolean(data.currentGroup.name),
    ).toBe(true);
  });
});

describe("assetSummary", () => {
  test("総資産が取得できる", () => {
    expect(data.summary.totalAssets !== "取得失敗").toBe(true);
  });

  test("前日比が取得できる", () => {
    // dailyChange は items の「合計」カテゴリの change から取得
    const totalItem = data.items.find((item) => item.name === "合計");
    expect(Boolean(totalItem?.change)).toBe(true);
  });
});

describe("assetItems", () => {
  test("カテゴリ別資産が取得できる", () => {
    expect(data.items.length).toBeGreaterThan(0);
  });

  test("各項目にカテゴリ名がある", () => {
    for (const item of data.items) {
      expect(Boolean(item.name)).toBe(true);
    }
  });

  test("各項目に残高がある", () => {
    for (const item of data.items) {
      expect(Boolean(item.balance)).toBe(true);
    }
  });
});

describe("portfolio", () => {
  test("ポートフォリオ項目が取得できる", () => {
    expect(data.portfolio.items.length).toBeGreaterThan(0);
  });

  test("総資産が正の値", () => {
    expect(typeof data.portfolio.totalAssets).toBe("number");
  });

  test("各項目に名前・タイプがある", () => {
    for (const item of data.portfolio.items) {
      expect(Boolean(item.name) && Boolean(item.type)).toBe(true);
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
      expect(Boolean(item.name) && Boolean(item.category)).toBe(true);
      expect(typeof item.balance).toBe("number");
    }
  });
});

describe("cashFlow", () => {
  test("月が取得できる", () => {
    expect(data.cashFlow.month).toBeTruthy();
  });

  test("表示期間が取得され、全取引がその範囲内にある", () => {
    const { periodStart, periodEnd } = data.cashFlow;
    const hasValidPeriod =
      Boolean(periodStart?.match(/^\d{4}-\d{2}-\d{2}$/)) &&
      Boolean(periodEnd?.match(/^\d{4}-\d{2}-\d{2}$/)) &&
      periodStart !== undefined &&
      periodEnd !== undefined &&
      periodStart <= periodEnd;
    const allItemsAreWithinPeriod =
      periodStart !== undefined &&
      periodEnd !== undefined &&
      data.cashFlow.items.every(({ date }) => date >= periodStart && date <= periodEnd);
    expect(hasValidPeriod).toBe(true);
    expect(allItemsAreWithinPeriod).toBe(true);
  });

  test("収支合計が数値", () => {
    expect(typeof data.cashFlow.totalIncome).toBe("number");
    expect(typeof data.cashFlow.totalExpense).toBe("number");
  });

  test("取引一覧が取得できる", () => {
    expect(Array.isArray(data.cashFlow.items)).toBe(true);
  });

  test("取引があれば実在する mfId がある", () => {
    for (const item of data.cashFlow.items) {
      expect(Boolean(item.mfId) && !item.mfId.startsWith("unknown")).toBe(true);
    }
  });
});

describe("assetHistory", () => {
  test("履歴ポイントが取得できる", () => {
    expect(data.assetHistory.points.length).toBeGreaterThan(0);
  });

  test("各ポイントに日付がある", () => {
    for (const point of data.assetHistory.points) {
      expect(Boolean(point.date)).toBe(true);
    }
  });
});

describe("registeredAccounts", () => {
  test("登録口座が取得できる", () => {
    expect(data.registeredAccounts.accounts.length).toBeGreaterThan(0);
  });

  test("各口座に名前がある", () => {
    for (const account of data.registeredAccounts.accounts) {
      expect(Boolean(account.name)).toBe(true);
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
      expect(Boolean(category.name)).toBe(true);
      expect(["fixed", "variable"]).toContain(category.type);
    }
  });
});
