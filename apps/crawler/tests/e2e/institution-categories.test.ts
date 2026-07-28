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
        const extractableAccountIds = new Set<string>();

        for (const list of lists) {
          let hasCategory = false;
          accountCount += list.querySelectorAll(":scope > li.account").length;
          categoryHeadingCount += list.querySelectorAll(":scope > li.heading-category-name").length;

          for (const child of list.children) {
            if (child.classList.contains("heading-category-name")) {
              hasCategory = Boolean(child.textContent?.trim());
              continue;
            }
            if (!hasCategory || !child.classList.contains("account")) continue;

            const link = child.querySelector<HTMLAnchorElement>(
              ".heading-accounts a[href*='/accounts/show'], a[href*='/accounts/edit/']",
            );
            const match = link
              ?.getAttribute("href")
              ?.match(/\/accounts\/(?:show(?:_manual)?|edit)\/([^/?]+)/);
            if (match?.[1]) {
              extractableLinkCount++;
              extractableAccountIds.add(match[1]);
            }
          }
        }

        return {
          accountCount,
          categoryHeadingCount,
          extractableAccountCount: extractableAccountIds.size,
          extractableLinkCount,
          listCount: lists.length,
        };
      });

      expect(structure.listCount).toBeGreaterThan(0);
      expect(structure.accountCount).toBeGreaterThan(0);
      expect(structure.categoryHeadingCount).toBeGreaterThan(0);
      expect(structure.extractableLinkCount).toBeGreaterThan(0);
      expect(categoryMap.size).toBe(structure.extractableAccountCount);
    });
  });
});
