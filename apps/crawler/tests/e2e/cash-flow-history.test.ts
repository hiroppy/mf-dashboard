import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Browser, BrowserContext } from "playwright";
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  scrapeCashFlowHistory,
  waitForCashFlowFetchApplied,
} from "../../src/scrapers/cash-flow-history.js";
import { ensureCurrentCashFlowView } from "../../src/scrapers/cash-flow.js";
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

  test("CSVリンクがない実ページから当日期間へ戻れる", async () => {
    await withNewPage(context, async (page) => {
      await page.goto(mfUrls.cashFlow, { waitUntil: "domcontentloaded" });
      await page.locator("#cf-detail-table").waitFor({ state: "visible", timeout: 10000 });

      const monthHeader = page.locator(".fc-header-title h2").first();
      const nextButton = page.locator("button.fc-button-next, span.fc-button-next").first();
      await ensureCurrentCashFlowView(page);
      const currentPeriodHeader = await monthHeader.textContent();
      let foundEmptyPeriod = false;
      for (let attempt = 0; attempt < 12; attempt++) {
        const previousHeader = await monthHeader.textContent();
        await waitForCashFlowFetchApplied(page, async () => {
          const [fetchResponse] = await Promise.all([
            page.waitForResponse(
              (response) => response.url().includes("/cf/fetch") && response.status() === 200,
            ),
            nextButton.click(),
          ]);
          const responseFailure = await fetchResponse.finished();
          if (responseFailure) throw responseFailure;
        });
        await expect.poll(() => monthHeader.textContent()).not.toBe(previousHeader);
        if ((await page.locator("a[href*='/cf/csv']").count()) === 0) {
          foundEmptyPeriod = true;
          break;
        }
      }
      expect(foundEmptyPeriod).toBe(true);

      const emptyPeriodHeader = await monthHeader.textContent();
      await ensureCurrentCashFlowView(page);
      const restoredHeader = await monthHeader.textContent();
      expect(restoredHeader).not.toBe(emptyPeriodHeader);
      expect(restoredHeader).toBe(currentPeriodHeader);
      await expect(page.locator("#cf-detail-table").isVisible()).resolves.toBe(true);
    });
  });
});
