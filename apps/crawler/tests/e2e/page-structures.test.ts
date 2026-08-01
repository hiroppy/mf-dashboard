import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Browser, BrowserContext, Locator, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { launchLoggedInContext, withNewPage } from "./helpers.js";

const NAVIGATION_TIMEOUT = 30000;

let browser: Browser;
let context: BrowserContext;

async function gotoPage(page: Page, url: string, pathname: string): Promise<void> {
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: NAVIGATION_TIMEOUT,
  });

  expect(response?.ok()).toBe(true);
  expect(new URL(page.url()).pathname).toBe(pathname);
}

async function expectOptionalRowsHaveMinimumCellCount(
  rows: Locator,
  minimum: number,
): Promise<void> {
  const cellCounts = await rows.evaluateAll((elements) =>
    elements.map((row) => row.querySelectorAll("td").length),
  );
  if (cellCounts.length === 0) return;

  expect(cellCounts.every((count) => count >= minimum)).toBe(true);
}

beforeAll(async () => {
  ({ browser, context } = await launchLoggedInContext());
});

afterAll(async () => {
  await context?.close();
  await browser?.close();
});

describe("crawler page structures", () => {
  test("homeに資産サマリーの取得に必要な構造が存在する", async () => {
    await withNewPage(context, async (page) => {
      await gotoPage(page, mfUrls.home, "/");

      const totalAssets = page.locator(".heading-radius-box, .total-assets").first();
      await totalAssets.waitFor({ state: "visible", timeout: 10000 });
      expect(await page.locator("table.pfm-sheet-table tbody tr").count()).toBeGreaterThanOrEqual(
        2,
      );
    });
  });

  test("asset historyに履歴の取得に必要な表構造が存在する", async () => {
    await withNewPage(context, async (page) => {
      await gotoPage(page, mfUrls.assetHistory, "/bs/history");

      const table = page.locator("table.table-bordered").first();
      await table.waitFor({ state: "visible", timeout: 10000 });
      const structure = await table.evaluate((element) => {
        const headerCount = element.querySelectorAll("thead th").length;
        const rows = [...element.querySelectorAll("tbody tr")];
        return {
          headerCount,
          rowCount: rows.length,
          rowsWithDateHeader: rows.filter((row) => row.querySelector("th")).length,
          rowsWithRequiredCells: rows.filter(
            (row) => row.querySelectorAll("td").length >= headerCount - 1,
          ).length,
        };
      });

      expect(structure.headerCount).toBeGreaterThanOrEqual(3);
      expect(structure.rowCount).toBeGreaterThan(0);
      expect(structure.rowsWithDateHeader).toBe(structure.rowCount);
      expect(structure.rowsWithRequiredCells).toBe(structure.rowCount);
    });
  });

  test("liabilityに負債の取得に必要なページ構造が存在する", async () => {
    await withNewPage(context, async (page) => {
      await gotoPage(page, mfUrls.liability, "/bs/liability");

      const heading = page.locator("h1").first();
      await heading.waitFor({ state: "visible", timeout: 10000 });
      expect(await heading.isVisible()).toBe(true);

      const liabilityTables = page.locator("table.table-det, table.table-bordered");
      await liabilityTables.first().waitFor({ state: "visible", timeout: 10000 });
      expect(await liabilityTables.count()).toBeGreaterThan(0);

      await expectOptionalRowsHaveMinimumCellCount(page.locator("table.table-det tbody tr"), 4);
      await expectOptionalRowsHaveMinimumCellCount(
        page.locator("table.table-bordered tbody tr"),
        2,
      );
    });
  });

  test("cash flowに月次合計と明細の取得に必要な表構造が存在する", async () => {
    await withNewPage(context, async (page) => {
      await gotoPage(page, mfUrls.cashFlow, "/cf");

      const detailTable = page.locator("#cf-detail-table");
      await detailTable.waitFor({ state: "visible", timeout: 10000 });
      const summaryCells = page
        .locator("#monthly_total_table_kakeibo tbody tr")
        .first()
        .locator("td");
      expect(await summaryCells.count()).toBeGreaterThanOrEqual(5);

      const detailRows = detailTable.locator("tbody tr[id^='js-transaction-']");
      await expectOptionalRowsHaveMinimumCellCount(detailRows, 7);
    });
  });

  test("monthly cash flowに月別収支の取得に必要な表構造が存在する", async () => {
    await withNewPage(context, async (page) => {
      await gotoPage(page, mfUrls.monthlyCashFlow, "/cf/monthly");

      const table = page.locator("#monthly_list");
      await table.waitFor({ state: "visible", timeout: 10000 });
      const headerCount = await table.locator("tr").first().locator("th, td").count();
      const incomeCellCount = await table
        .locator("tr")
        .filter({ hasText: /収入合計/ })
        .first()
        .locator("td")
        .count();
      const expenseCellCount = await table
        .locator("tr")
        .filter({ hasText: /支出合計/ })
        .first()
        .locator("td")
        .count();

      expect(headerCount).toBeGreaterThan(1);
      expect(incomeCellCount).toBe(headerCount);
      expect(expenseCellCount).toBe(headerCount);
    });
  });
});
