import { getJstYearMonthKey } from "@mf-dashboard/date-utils";
import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Browser, BrowserContext } from "playwright";
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { scrapeCashFlowHistory } from "../../src/scrapers/cash-flow-history.js";
import { getDisplayedCashFlowState } from "../../src/scrapers/cash-flow.js";
import {
  gotoHome,
  launchLoggedInContext,
  saveScreenshot,
  withErrorScreenshot,
  withNewPage,
} from "./helpers.js";

let browser: Browser;
let context: BrowserContext;

beforeAll(async () => {
  ({ browser, context } = await launchLoggedInContext());
});

afterAll(async () => {
  await context?.close();
  await browser?.close();
});

describe("scrapeCashFlowHistory", () => {
  test("過去2ヶ月分の家計簿が取得できる", async () => {
    await withNewPage(context, async (page) => {
      await gotoHome(page);

      await saveScreenshot(page, "cash-flow-history-test-before-scrape.png");

      const results = await withErrorScreenshot(page, "cash-flow-history-test-error.png", () =>
        scrapeCashFlowHistory(page, 2),
      );

      expect(results.length).toBe(2);

      // 異なる月であることを確認
      const months = results.map((r) => r.month);
      const uniqueMonths = new Set(months);
      expect(uniqueMonths.size).toBe(results.length);

      for (const { month, data } of results) {
        expect(month).toMatch(/^\d{4}-\d{2}$/);
        expect(typeof data.totalIncome).toBe("number");
        expect(typeof data.totalExpense).toBe("number");
        expect(Array.isArray(data.items)).toBe(true);
      }
    });
  });

  test("各トランザクションに必須フィールドがある", async () => {
    await withNewPage(context, async (page) => {
      await gotoHome(page);

      const results = await scrapeCashFlowHistory(page, 1);
      const { data } = results[0];

      for (const item of data.items) {
        expect(Boolean(item.mfId)).toBe(true);
        expect(/^\d{4}-\d{2}-\d{2}$/.test(item.date)).toBe(true);
        expect(typeof item.description).toBe("string");
        expect(typeof item.amount).toBe("number");
        expect(["income", "expense", "transfer"]).toContain(item.type);
      }
    });
  });

  test("CSVリンクがない月跨ぎ表示では期間終了月を対象月にする", async () => {
    await withNewPage(context, async (page) => {
      await page.goto(mfUrls.cashFlow, { waitUntil: "domcontentloaded" });
      await page.locator("#cf-detail-table").waitFor({ state: "visible", timeout: 10000 });

      const currentMonth = getJstYearMonthKey();
      const [year, month] = currentMonth.split("-").map(Number);
      const previousMonth = new Date(year!, month! - 2, 1);
      const rangeHeader = `${previousMonth.getFullYear()}/${previousMonth.getMonth() + 1}/26 - ${year}/${month}/25`;
      await page.evaluate((header) => {
        document.querySelector("a[href*='/cf/csv']")?.remove();
        const title = document.querySelector(".fc-header-title h2");
        if (!title) throw new Error("Cash flow month header is unavailable");
        title.textContent = header;
      }, rangeHeader);

      const state = await getDisplayedCashFlowState(page);
      expect(state?.month).toBe(currentMonth);
      expect(state?.periodEnd).toBe(`${currentMonth}-25`);
    });
  });
});
