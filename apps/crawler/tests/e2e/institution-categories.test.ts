import type { Browser, BrowserContext } from "playwright";
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { scrapeInstitutionCategories } from "../../src/scrapers/institution-categories.js";
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

describe("scrapeInstitutionCategories", () => {
  test("実HTMLの口座一覧構造からカテゴリを取得できる", async () => {
    await withNewPage(context, async (page) => {
      const categoryMap = await scrapeInstitutionCategories(page);
      const structure = await page.locator(".facilities.accounts-list").evaluateAll((lists) => {
        let accountCount = 0;
        let categoryHeadingCount = 0;
        let extractableLinkCount = 0;

        for (const list of lists) {
          accountCount += list.querySelectorAll(":scope > li.account").length;
          categoryHeadingCount += list.querySelectorAll(":scope > li.heading-category-name").length;
          extractableLinkCount += list.querySelectorAll(
            ":scope > li.account .heading-accounts a[href*='/accounts/show'], " +
              ":scope > li.account a[href*='/accounts/edit/']",
          ).length;
        }

        return {
          accountCount,
          categoryHeadingCount,
          extractableLinkCount,
          listCount: lists.length,
        };
      });

      expect(structure.listCount).toBeGreaterThan(0);
      expect(structure.accountCount).toBeGreaterThan(0);
      expect(structure.categoryHeadingCount).toBeGreaterThan(0);
      expect(structure.extractableLinkCount).toBeGreaterThan(0);
      expect(categoryMap.size).toBeGreaterThan(0);
      expect([...categoryMap].every(([id, category]) => id.length > 0 && category.length > 0)).toBe(
        true,
      );
    });
  });
});
