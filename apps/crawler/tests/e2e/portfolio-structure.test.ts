import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Browser, BrowserContext, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { PENSION_CORE_COLUMN_COUNT } from "../../src/scrapers/portfolio.js";
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

async function getFirstPensionDetailHref(page: Page): Promise<string | null> {
  await gotoPortfolio(page);
  const tables = page.locator("table.table-pns");
  for (let index = 0; index < (await tables.count()); index++) {
    const table = tables.nth(index);
    const heading = table.locator("xpath=preceding::h1[contains(@class, 'heading-normal')][1]");
    if ((await heading.textContent({ timeout: 1000 }).catch(() => ""))?.trim() !== "年金") {
      continue;
    }
    const detailLink = table.locator('a[href*="/accounts/show/"]').first();
    return (await detailLink.count()) > 0 ? detailLink.getAttribute("href") : null;
  }
  return null;
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
      await gotoPortfolio(page);
      const candidateRow = page
        .locator(
          'table.table-pns tbody tr:has(input[name="user_asset_det[id]"]):has(input[name="user_asset_det[sub_account_id_hash]"]):has(a[href*="/accounts/show_manual/"])',
        )
        .first();
      if ((await candidateRow.count()) === 0) {
        skip("The portfolio has no linked manual holding candidate");
      }
      const detailHref = await candidateRow
        .locator('a[href*="/accounts/show_manual/"]')
        .first()
        .getAttribute("href");
      if (!detailHref) skip("The portfolio has no linked manual holding candidate");

      const response = await page.goto(new URL(detailHref, mfUrls.home).toString(), {
        waitUntil: "domcontentloaded",
      });
      expect(response?.ok()).toBe(true);
      expect(new URL(page.url()).pathname).toMatch(/^\/accounts\/show_manual\//);
      expect(
        await page
          .locator(
            'table.table-pns tbody tr:has(input[name="user_asset_det[id]"]):has(input[name="user_asset_det[sub_account_id_hash]"])',
          )
          .count(),
      ).toBeGreaterThan(0);
      expect(
        await page
          .locator('input[name="account[id_hash]"], input[name="rollover_info[account_id_hash]"]')
          .count(),
      ).toBeGreaterThan(0);
    });
  });

  test("通常口座詳細の年金表はparserが必要とする主要列を持つ", async ({ skip }) => {
    await withNewPage(context, async (page) => {
      const detailHref = await getFirstPensionDetailHref(page);
      if (!detailHref) skip("The portfolio has no linked pension holding candidate");

      const response = await page.goto(new URL(detailHref, mfUrls.home).toString(), {
        waitUntil: "domcontentloaded",
      });
      expect(response?.ok()).toBe(true);
      expect(new URL(page.url()).pathname).toMatch(/^\/accounts\/show\//);

      const tables = page.locator("table.table-pns");
      let foundPensionStructure = false;
      for (let index = 0; index < (await tables.count()); index++) {
        const table = tables.nth(index);
        const heading = table.locator("xpath=preceding::h1[contains(@class, 'heading-normal')][1]");
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
      expect(foundPensionStructure).toBe(true);
    });
  });
});
