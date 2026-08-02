import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Browser, BrowserContext } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
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

describe("category page structures", () => {
  test("spending targetsにカテゴリ抽出に必要な行と属性が存在する", async () => {
    await withNewPage(context, async (page) => {
      const response = await page.goto(mfUrls.spendingTargets, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      expect(response?.ok()).toBe(true);

      const rows = page.locator("table.table-bordered tbody tr.large_category");
      await rows.first().waitFor({ state: "visible", timeout: 30000 });
      const structure = await rows.evaluateAll((elements) => ({
        rowCount: elements.length,
        rowsWithCategoryId: elements.filter((element) =>
          element.querySelector("input[name='spending_targets[][large_category_id]'][value]"),
        ).length,
      }));

      expect(structure.rowCount).toBeGreaterThan(0);
      expect(structure.rowsWithCategoryId).toBe(structure.rowCount);
    });
  });

  test("category rulesに大・中カテゴリ抽出に必要な階層と属性が存在する", async () => {
    await withNewPage(context, async (page) => {
      const response = await page.goto(mfUrls.categoryRules, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      expect(response?.ok()).toBe(true);

      const settings = page.locator("#category-settings");
      await settings.waitFor({ state: "visible", timeout: 30000 });
      const structure = await settings.evaluate((element) => {
        const largeCategories = [...element.querySelectorAll<HTMLElement>("li.dropdown-submenu")];
        const middleCategories = [
          ...element.querySelectorAll<HTMLElement>(
            "li.dropdown-submenu > ul.sub_menu > li[id^='js-middle-category-li-']",
          ),
        ];

        return {
          largeCategoryCount: largeCategories.length,
          largeCategoriesWithId: largeCategories.filter((category) =>
            category.querySelector(":scope > a.dropdown-toggle[id]"),
          ).length,
          middleCategoryCount: middleCategories.length,
          middleCategoriesWithName: middleCategories.filter((category) =>
            category.querySelector(
              ":scope > .middle_category_default, :scope > .middle_category_user",
            ),
          ).length,
        };
      });

      expect(structure.largeCategoryCount).toBeGreaterThan(0);
      expect(structure.largeCategoriesWithId).toBe(structure.largeCategoryCount);
      expect(structure.middleCategoryCount).toBeGreaterThan(0);
      expect(structure.middleCategoriesWithName).toBe(structure.middleCategoryCount);
    });
  });
});
