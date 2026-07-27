import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Browser, BrowserContext, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { scrapeInstitutionCategories } from "../../src/scrapers/institution-categories.js";
import { selectManualHoldingAccounts } from "../../src/scrapers/manual-holding-accounts.js";
import { PNS_CORE_COLUMN_COUNT, selectLinkedPnsAccounts } from "../../src/scrapers/portfolio.js";
import { getRegisteredAccounts } from "../../src/scrapers/registered-accounts.js";
import { launchLoggedInContext, withNewPage } from "./helpers.js";

const PORTFOLIO_TABLE_SELECTOR =
  "table.table-depo, table.table-eq, table.table-mf, table.table-pns";

let browser: Browser;
let context: BrowserContext;

async function gotoPortfolio(page: Page): Promise<void> {
  await page.goto(mfUrls.portfolio, { waitUntil: "domcontentloaded" });
  await page.locator("h1.heading-normal").first().waitFor({
    state: "visible",
    timeout: 10000,
  });
}

beforeAll(async () => {
  ({ browser, context } = await launchLoggedInContext());
});

afterAll(async () => {
  await context?.close();
  await browser?.close();
});

describe("portfolio page structure", () => {
  test("portfolioのカテゴリ見出し・表・行構造が存在する", async () => {
    await withNewPage(context, async (page) => {
      await gotoPortfolio(page);

      expect(new URL(page.url()).pathname).toBe("/bs/portfolio");
      const tables = page.locator(PORTFOLIO_TABLE_SELECTOR);
      expect(await tables.count()).toBeGreaterThan(0);

      for (let index = 0; index < (await tables.count()); index++) {
        const table = tables.nth(index);
        expect(
          await table.locator("xpath=preceding::h1[contains(@class, 'heading-normal')][1]").count(),
        ).toBe(1);
        const rows = table.locator("tbody tr");
        expect(await rows.count()).toBeGreaterThan(0);
        expect(await rows.first().locator("td").count()).toBeGreaterThan(0);
      }
    });
  });

  test("手動口座詳細とportfolio行に同じ明示キー構造が存在する", async ({ skip }) => {
    await withNewPage(context, async (page) => {
      const candidate = selectManualHoldingAccounts(await getRegisteredAccounts(page))[0];
      if (!candidate) skip("The authenticated account has no manual holding candidate");

      const response = await page.goto(new URL(candidate.url, mfUrls.home).toString(), {
        waitUntil: "domcontentloaded",
      });
      expect(response?.ok()).toBe(true);
      expect(new URL(page.url()).pathname).toMatch(/^\/accounts\/show_manual\//);
      const rowsWithKeys = page.locator(
        'table.table-pns tbody tr:has(input[name="user_asset_det[id]"]):has(input[name="user_asset_det[sub_account_id_hash]"])',
      );
      if ((await rowsWithKeys.count()) === 0) {
        skip("The single manual-account candidate has no keyed holding row");
      }
      const detailRow = rowsWithKeys.first();
      const [holdingMfId, subAccountMfId] = await Promise.all([
        detailRow.locator('input[name="user_asset_det[id]"]').inputValue(),
        detailRow.locator('input[name="user_asset_det[sub_account_id_hash]"]').inputValue(),
      ]);
      expect(
        await page
          .locator('input[name="account[id_hash]"], input[name="rollover_info[account_id_hash]"]')
          .count(),
      ).toBeGreaterThan(0);

      await gotoPortfolio(page);
      const portfolioRowsWithKeys = page.locator(
        'table.table-pns tbody tr:has(input[name="user_asset_det[id]"]):has(input[name="user_asset_det[sub_account_id_hash]"])',
      );
      let foundMatchingPortfolioKey = false;
      for (let index = 0; index < (await portfolioRowsWithKeys.count()); index++) {
        const row = portfolioRowsWithKeys.nth(index);
        const [portfolioHoldingMfId, portfolioSubAccountMfId] = await Promise.all([
          row.locator('input[name="user_asset_det[id]"]').inputValue(),
          row.locator('input[name="user_asset_det[sub_account_id_hash]"]').inputValue(),
        ]);
        if (portfolioHoldingMfId === holdingMfId && portfolioSubAccountMfId === subAccountMfId) {
          foundMatchingPortfolioKey = true;
          break;
        }
      }
      expect(foundMatchingPortfolioKey).toBe(true);
    });
  });

  test("通常口座詳細の保険・年金表はparserが必要とする主要列を持つ", async ({ skip }) => {
    await withNewPage(context, async (page) => {
      // Production scans every linked account for correctness. This structure-only E2E caps
      // navigation at one detail page selected by sidebar category, without narrowing production.
      const institutionCategories = await scrapeInstitutionCategories(page);
      const candidate = selectLinkedPnsAccounts(await getRegisteredAccounts(page)).find(
        ({ mfId }) => {
          const category = institutionCategories.get(mfId);
          return category === "保険" || category === "年金";
        },
      );
      if (!candidate) {
        skip("The authenticated account has no linked insurance/pension account candidate");
      }

      const response = await page.goto(new URL(candidate.url, mfUrls.home).toString(), {
        waitUntil: "domcontentloaded",
      });
      expect(response?.ok()).toBe(true);
      expect(new URL(page.url()).pathname).toMatch(/^\/accounts\/show\//);

      const tables = page.locator("table.table-pns");
      let foundLinkedPnsStructure = false;
      for (let index = 0; index < (await tables.count()); index++) {
        const table = tables.nth(index);
        const heading = table.locator("xpath=preceding::h1[contains(@class, 'heading-normal')][1]");
        const category = (await heading.textContent({ timeout: 1000 }).catch(() => ""))?.trim();
        if (category !== "保険" && category !== "年金") {
          continue;
        }

        const rows = table.locator("tbody tr");
        if ((await rows.count()) === 0) continue;
        expect(await rows.first().locator("td").count()).toBeGreaterThanOrEqual(
          PNS_CORE_COLUMN_COUNT,
        );
        foundLinkedPnsStructure = true;
        break;
      }
      if (!foundLinkedPnsStructure) {
        skip("The single linked-account candidate has no insurance/pension table");
      }
    });
  });
});
