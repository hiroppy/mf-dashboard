import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Browser, BrowserContext, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { PNS_CORE_COLUMN_COUNT } from "../../src/scrapers/portfolio.js";
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

async function getLinkedPnsDetailHref(page: Page): Promise<string | null> {
  await page.goto(mfUrls.home, { waitUntil: "domcontentloaded" });

  return page.locator(".facilities.accounts-list").evaluateAll((lists) => {
    for (const list of lists) {
      let isTargetCategory = false;
      for (const child of list.children) {
        if (child.classList.contains("heading-category-name")) {
          const heading = child.textContent?.trim();
          isTargetCategory = heading === "保険" || heading === "年金";
          continue;
        }
        if (!isTargetCategory || !child.classList.contains("account")) continue;

        const href = child
          .querySelector<HTMLAnchorElement>("a[href*='/accounts/show/']")
          ?.getAttribute("href");
        if (href) return href;
      }
    }
    return null;
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

  test("手動口座詳細とportfolio行に明示キー構造が存在する", async ({ skip }) => {
    await withNewPage(context, async (page) => {
      await gotoPortfolio(page);
      const portfolioRowsWithKeys = page.locator(
        'table.table-pns tbody tr:has(input[name="user_asset_det[id]"]):has(input[name="user_asset_det[sub_account_id_hash]"])',
      );
      if ((await portfolioRowsWithKeys.count()) === 0) {
        skip("No representative manual holding row is available");
      }

      await page.goto(mfUrls.home, { waitUntil: "domcontentloaded" });
      const detailLink = page.locator("a[href*='/accounts/show_manual/']").first();
      const detailHref = await detailLink.getAttribute("href");
      if (!detailHref) {
        skip("No representative manual account is available");
      }

      const response = await page.goto(new URL(detailHref, mfUrls.home).toString(), {
        waitUntil: "domcontentloaded",
      });
      expect(response?.ok()).toBe(true);
      expect(new URL(page.url()).pathname.startsWith("/accounts/show_manual/")).toBe(true);
      const detailRowsWithKeys = page.locator(
        'table.table-pns tbody tr:has(input[name="user_asset_det[id]"]):has(input[name="user_asset_det[sub_account_id_hash]"])',
      );
      expect(await detailRowsWithKeys.count()).toBeGreaterThan(0);
      expect(
        await page
          .locator('input[name="account[id_hash]"], input[name="rollover_info[account_id_hash]"]')
          .count(),
      ).toBeGreaterThan(0);
    });
  });

  test("預金行に金融機関セルと任意の口座詳細リンク構造が存在する", async ({ skip }) => {
    await withNewPage(context, async (page) => {
      await gotoPortfolio(page);
      const rows = page.locator("table.table-depo tbody tr");
      if ((await rows.count()) === 0) {
        skip("No representative deposit row is available");
      }

      for (let index = 0; index < (await rows.count()); index++) {
        const institutionCell = rows.nth(index).locator("td").nth(2);
        expect(await institutionCell.count()).toBe(1);
        expect(((await institutionCell.textContent())?.trim().length ?? 0) > 0).toBe(true);

        const detailLinks = institutionCell.locator("a");
        expect(await detailLinks.count()).toBeLessThanOrEqual(1);
        expect(
          await detailLinks.evaluateAll((links) =>
            links.every(({ href }) => new URL(href).pathname.startsWith("/accounts/show/")),
          ),
        ).toBe(true);
      }
    });
  });

  test("通常口座詳細の保険・年金表はparserが必要とする主要列を持つ", async ({ skip }) => {
    await withNewPage(context, async (page) => {
      // Production scans every linked account for correctness. This structure-only E2E caps
      // navigation at one detail page selected from the sidebar DOM, without narrowing production.
      const detailHref = await getLinkedPnsDetailHref(page);
      if (!detailHref) {
        skip("No representative linked insurance or pension account is available");
      }

      const response = await page.goto(new URL(detailHref, mfUrls.home).toString(), {
        waitUntil: "domcontentloaded",
      });
      expect(response?.ok()).toBe(true);
      expect(new URL(page.url()).pathname.startsWith("/accounts/show/")).toBe(true);

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
      expect(foundLinkedPnsStructure).toBe(true);
    });
  });
});
