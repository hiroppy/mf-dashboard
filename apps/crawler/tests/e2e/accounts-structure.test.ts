import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Browser, BrowserContext } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { scrapeInstitutionCategories } from "../../src/scrapers/institution-categories.js";
import { selectLinkedPnsAccounts } from "../../src/scrapers/portfolio.js";
import { getRegisteredAccounts } from "../../src/scrapers/registered-accounts.js";
import { launchLoggedInContext, withNewPage } from "./helpers.js";

let browser: Browser;
let context: BrowserContext;

beforeAll(async () => {
  ({ browser, context } = await launchLoggedInContext());
});

afterAll(async () => {
  await context?.close();
  await browser?.close();
});

describe("accounts page structure", () => {
  test("更新状態の取得に必要な実HTML構造が存在する", async () => {
    await withNewPage(context, async (page) => {
      await page.goto(mfUrls.accounts, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      const accountTable = page.locator("#account-table");
      await accountTable.first().waitFor({ state: "visible", timeout: 30000 });
      const rows = accountTable.locator("tr:has(td.account-status)");
      const structure = await rows.evaluateAll((elements) => ({
        rowCount: elements.length,
        rowsWithAccountReference: elements.filter((row) =>
          row.querySelector(
            "td.service a, a[href*='/accounts/edit/'], form[action*='/accounts/edit/']",
          ),
        ).length,
        rowsWithStatus: elements.filter((row) => row.querySelector("td.account-status")).length,
      }));

      expect(structure.rowCount).toBeGreaterThan(0);
      expect(structure.rowsWithAccountReference).toBe(structure.rowCount);
      expect(structure.rowsWithStatus).toBe(structure.rowCount);
    });
  });

  test("代表カード口座の詳細に引き落とし予定額の合計と表構造が存在する", async (testContext) => {
    await withNewPage(context, async (page) => {
      // Production checks every linked detail page. This read-only E2E inspects at most one
      // representative card page and skips when the current account set has no card candidate.
      const categories = await scrapeInstitutionCategories(page);
      const candidate = selectLinkedPnsAccounts(await getRegisteredAccounts(page)).find(
        ({ mfId }) => categories.get(mfId) === "カード",
      );
      if (!candidate) {
        testContext.skip();
        return;
      }

      const response = await page.goto(mfUrls.accountDetail(candidate.mfId), {
        waitUntil: "domcontentloaded",
      });
      expect(response?.ok()).toBe(true);

      const summaryCount = await page
        .locator("h1.heading-small")
        .filter({ hasText: "引き落とし予定額：" })
        .count();
      expect(summaryCount).toBe(1);
    });
  });
});
