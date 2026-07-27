import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Browser, BrowserContext, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { PENSION_CORE_COLUMN_COUNT } from "../../src/scrapers/portfolio.js";
import { launchLoggedInContext, withNewPage } from "./helpers.js";

const PORTFOLIO_TABLE_SELECTOR =
  "table.table-depo, table.table-eq, table.table-mf, table.table-pns";

let browser: Browser;
let context: BrowserContext;

async function getAccountDetailHrefs(page: Page, pathPart: string): Promise<string[]> {
  await page.goto(mfUrls.accounts, { waitUntil: "domcontentloaded" });
  await page.locator("#account-table").first().waitFor({ state: "visible", timeout: 10000 });

  return page
    .locator(`a[href*="${pathPart}"]`)
    .evaluateAll((links) => [
      ...new Set(
        links
          .map((link) => link.getAttribute("href"))
          .filter((href): href is string => href !== null),
      ),
    ]);
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
      await page.goto(mfUrls.portfolio, { waitUntil: "domcontentloaded" });
      await page.locator("h1.heading-normal").first().waitFor({
        state: "visible",
        timeout: 10000,
      });

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

  test("手動口座詳細とportfolio行に同じ明示キー構造が存在する", async () => {
    await withNewPage(context, async (page) => {
      const detailHrefs = await getAccountDetailHrefs(page, "/accounts/show_manual/");
      expect(detailHrefs.length).toBeGreaterThan(0);

      let foundDetailStructure = false;
      for (const href of detailHrefs) {
        const response = await page.goto(new URL(href, mfUrls.home).toString(), {
          waitUntil: "domcontentloaded",
        });
        if (!response?.ok() || !new URL(page.url()).pathname.startsWith("/accounts/show_manual/")) {
          continue;
        }

        const rowsWithKeys = page.locator(
          'table.table-pns tbody tr:has(input[name="user_asset_det[id]"]):has(input[name="user_asset_det[sub_account_id_hash]"])',
        );
        if ((await rowsWithKeys.count()) === 0) continue;

        expect(
          await page
            .locator('input[name="account[id_hash]"], input[name="rollover_info[account_id_hash]"]')
            .count(),
        ).toBeGreaterThan(0);
        foundDetailStructure = true;
        break;
      }
      expect(foundDetailStructure).toBe(true);

      await page.goto(mfUrls.portfolio, { waitUntil: "domcontentloaded" });
      const portfolioRowsWithKeys = page.locator(
        'table.table-pns tbody tr:has(input[name="user_asset_det[id]"]):has(input[name="user_asset_det[sub_account_id_hash]"])',
      );
      expect(await portfolioRowsWithKeys.count()).toBeGreaterThan(0);
    });
  });

  test("通常口座詳細の年金表はparserが必要とする主要列を持つ", async () => {
    await withNewPage(context, async (page) => {
      const detailHrefs = await getAccountDetailHrefs(page, "/accounts/show/");
      expect(detailHrefs.length).toBeGreaterThan(0);

      let foundPensionStructure = false;
      for (const href of detailHrefs) {
        const response = await page.goto(new URL(href, mfUrls.home).toString(), {
          waitUntil: "domcontentloaded",
        });
        if (!response?.ok() || !new URL(page.url()).pathname.startsWith("/accounts/show/")) {
          continue;
        }

        const tables = page.locator("table.table-pns");
        for (let index = 0; index < (await tables.count()); index++) {
          const table = tables.nth(index);
          const heading = table.locator(
            "xpath=preceding::h1[contains(@class, 'heading-normal')][1]",
          );
          if ((await heading.textContent({ timeout: 1000 }).catch(() => ""))?.trim() !== "年金") {
            continue;
          }

          const rows = table.locator("tbody tr");
          if ((await rows.count()) === 0) continue;
          expect(await rows.first().locator("td").count()).toBeGreaterThanOrEqual(
            PENSION_CORE_COLUMN_COUNT,
          );
          foundPensionStructure = true;
          break;
        }
        if (foundPensionStructure) break;
      }

      expect(foundPensionStructure).toBe(true);
    });
  });
});
