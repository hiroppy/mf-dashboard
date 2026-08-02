import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Browser, BrowserContext, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createGroupScope, NO_GROUP_ID, switchGroup } from "../../src/scrapers/group.js";
import { scrapeInstitutionCategories } from "../../src/scrapers/institution-categories.js";
import { selectManualHoldingAccounts } from "../../src/scrapers/manual-holding-accounts.js";
import { PNS_CORE_COLUMN_COUNT, selectLinkedPnsAccounts } from "../../src/scrapers/portfolio.js";
import { getRegisteredAccounts } from "../../src/scrapers/registered-accounts.js";
import { launchLoggedInContext, withNewPage } from "./helpers.js";

const PORTFOLIO_TABLE_SELECTOR =
  "table.table-depo, table.table-eq, table.table-mf, table.table-pns";

let browser: Browser;
let context: BrowserContext;
let groupScopePage: Page;
let groupScope: Awaited<ReturnType<typeof createGroupScope>>;

async function gotoPortfolio(page: Page): Promise<void> {
  await page.goto(mfUrls.portfolio, { waitUntil: "domcontentloaded" });
  await page.locator("h1.heading-normal").first().waitFor({
    state: "visible",
    timeout: 10000,
  });
}

beforeAll(async () => {
  ({ browser, context } = await launchLoggedInContext());
  groupScopePage = await context.newPage();
  groupScope = await createGroupScope(groupScopePage);
  await switchGroup(groupScopePage, NO_GROUP_ID);
});

afterAll(async () => {
  try {
    await groupScope?.[Symbol.asyncDispose]();
  } finally {
    await groupScopePage?.close();
    await context?.close();
    await browser?.close();
  }
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

  test("手動口座詳細とportfolio行に同じ明示キー構造が存在する", async () => {
    await withNewPage(context, async (page) => {
      const manualAccounts = selectManualHoldingAccounts(await getRegisteredAccounts(page));
      await gotoPortfolio(page);
      const portfolioRowsWithKeys = page.locator(
        'table.table-pns tbody tr:has(input[name="user_asset_det[id]"]):has(input[name="user_asset_det[sub_account_id_hash]"])',
      );
      if ((await portfolioRowsWithKeys.count()) === 0) {
        throw new Error("The account has no portfolio row with explicit manual holding keys");
      }
      const portfolioRow = portfolioRowsWithKeys.first();
      const subAccountMfId = await portfolioRow
        .locator('input[name="user_asset_det[sub_account_id_hash]"]')
        .inputValue();

      // The transaction source selector exposes the sub-account key and display name. Use its
      // unique current manual-account match only to choose one representative detail page; the
      // assertions below verify only the structural contract used by the parser.
      await page.goto(mfUrls.home, { waitUntil: "domcontentloaded" });
      const sourceNames = await page.locator("option").evaluateAll((options, expected) => {
        const names = options.flatMap((option) => {
          if ((option as HTMLOptionElement).value !== expected) return [];
          const name = option.textContent?.trim();
          return name ? [name] : [];
        });
        return [...new Set(names)];
      }, subAccountMfId);
      const candidates = manualAccounts.filter(({ name }) => sourceNames.includes(name));
      if (candidates.length !== 1) {
        throw new Error(
          "The portfolio sub-account key does not resolve to one current manual account",
        );
      }
      const accountMfId = candidates[0]!.mfId;

      const response = await page.goto(mfUrls.accountDetail(accountMfId, "show_manual"), {
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

  test("預金行に金融機関セルと任意の口座詳細リンク構造が存在する", async () => {
    await withNewPage(context, async (page) => {
      await gotoPortfolio(page);
      const rows = page.locator("table.table-depo tbody tr");
      if ((await rows.count()) === 0) {
        throw new Error("The account has no deposit row");
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

  test("通常口座詳細の保険・年金表はparserが必要とする主要列を持つ", async () => {
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
        throw new Error("The account has no linked insurance/pension account candidate");
      }

      const response = await page.goto(new URL(candidate.url, mfUrls.home).toString(), {
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
      if (!foundLinkedPnsStructure) {
        throw new Error("The single linked-account candidate has no insurance/pension table");
      }
    });
  });
});
