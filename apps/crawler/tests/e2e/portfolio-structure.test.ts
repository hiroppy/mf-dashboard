import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Browser, BrowserContext, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { extractAccountMfIdFromDetailUrl } from "../../src/scrapers/account-detail.js";
import { getCurrentGroup, NO_GROUP_ID, switchGroup } from "../../src/scrapers/group.js";
import { scrapeInstitutionCategories } from "../../src/scrapers/institution-categories.js";
import { selectManualHoldingAccounts } from "../../src/scrapers/manual-holding-accounts.js";
import { PNS_CORE_COLUMN_COUNT, selectLinkedPnsAccounts } from "../../src/scrapers/portfolio.js";
import { getRegisteredAccounts } from "../../src/scrapers/registered-accounts.js";
import { launchLoggedInContext, withNewPage } from "./helpers.js";

const PORTFOLIO_TABLE_SELECTOR =
  "table.table-depo, table.table-eq, table.table-mf, table.table-pns";

let browser: Browser;
let context: BrowserContext;
let originalGroupId: string | null = null;

async function gotoPortfolio(page: Page): Promise<void> {
  await page.goto(mfUrls.portfolio, { waitUntil: "domcontentloaded" });
  await page.locator("h1.heading-normal").first().waitFor({
    state: "visible",
    timeout: 10000,
  });
}

beforeAll(async () => {
  ({ browser, context } = await launchLoggedInContext());
  await withNewPage(context, async (page) => {
    originalGroupId = (await getCurrentGroup(page))?.id ?? null;
    await switchGroup(page, NO_GROUP_ID);
  });
});

afterAll(async () => {
  const groupIdToRestore = originalGroupId;
  if (groupIdToRestore && groupIdToRestore !== NO_GROUP_ID) {
    await withNewPage(context, async (page) => {
      await switchGroup(page, groupIdToRestore);
    });
  }
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
      const [holdingMfId, subAccountMfId] = await Promise.all([
        portfolioRow.locator('input[name="user_asset_det[id]"]').inputValue(),
        portfolioRow.locator('input[name="user_asset_det[sub_account_id_hash]"]').inputValue(),
      ]);

      // The transaction source selector exposes the sub-account key and display name. Use its
      // unique current manual-account match only to choose one representative detail page; the
      // assertions below still verify ownership with explicit IDs rather than display names.
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
      expect(new URL(page.url()).pathname).toMatch(/^\/accounts\/show_manual\//);
      const detailRowsWithKeys = page.locator(
        'table.table-pns tbody tr:has(input[name="user_asset_det[id]"]):has(input[name="user_asset_det[sub_account_id_hash]"])',
      );
      let foundMatchingDetailKey = false;
      for (let index = 0; index < (await detailRowsWithKeys.count()); index++) {
        const detailRow = detailRowsWithKeys.nth(index);
        const [detailHoldingMfId, detailSubAccountMfId] = await Promise.all([
          detailRow.locator('input[name="user_asset_det[id]"]').inputValue(),
          detailRow.locator('input[name="user_asset_det[sub_account_id_hash]"]').inputValue(),
        ]);
        if (detailHoldingMfId === holdingMfId && detailSubAccountMfId === subAccountMfId) {
          foundMatchingDetailKey = true;
          break;
        }
      }
      expect(foundMatchingDetailKey).toBe(true);
      expect(
        await page
          .locator('input[name="account[id_hash]"], input[name="rollover_info[account_id_hash]"]')
          .evaluateAll(
            (inputs, expectedAccountMfId) =>
              inputs.filter((input) => (input as HTMLInputElement).value === expectedAccountMfId)
                .length,
            accountMfId,
          ),
      ).toBeGreaterThan(0);
    });
  });

  test("預金行を現在の登録口座へ一意に紐付けられる", async () => {
    await withNewPage(context, async (page) => {
      const institutionCategories = await scrapeInstitutionCategories(page);
      const registeredAccounts = await getRegisteredAccounts(page);
      const accountMfIdsByName = new Map<string, string[]>();
      for (const account of registeredAccounts.accounts) {
        const mfIds = accountMfIdsByName.get(account.name) ?? [];
        mfIds.push(account.mfId);
        accountMfIdsByName.set(account.name, mfIds);
      }

      await gotoPortfolio(page);
      const rows = page.locator("table.table-depo tbody tr");
      if ((await rows.count()) === 0) {
        throw new Error("The account has no deposit row");
      }

      for (let index = 0; index < (await rows.count()); index++) {
        const institutionCell = rows.nth(index).locator("td").nth(2);
        const href = await institutionCell
          .locator("a")
          .first()
          .getAttribute("href")
          .catch(() => null);
        const explicitAccountMfId = href ? extractAccountMfIdFromDetailUrl(href, "show") : null;
        const institution = (await institutionCell.textContent())?.trim() ?? "";
        const candidateMfIds = explicitAccountMfId
          ? [explicitAccountMfId]
          : (accountMfIdsByName.get(institution) ?? []);

        expect(candidateMfIds).toHaveLength(1);
        expect(institutionCategories.has(candidateMfIds[0]!)).toBe(true);
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
        throw new Error("The single linked-account candidate has no insurance/pension table");
      }
    });
  });
});
