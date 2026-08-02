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

describe("institution category structure", () => {
  test("homeに金融機関カテゴリ抽出に必要な一覧・見出し・口座リンクが存在する", async () => {
    await withNewPage(context, async (page) => {
      const response = await page.goto(mfUrls.home, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      expect(response?.ok()).toBe(true);

      const lists = page.locator(".facilities.accounts-list");
      await lists.first().waitFor({ state: "visible", timeout: 30000 });
      const structure = await lists.evaluateAll((elements) => ({
        listCount: elements.length,
        categoryHeadingCount: elements.reduce(
          (count, element) =>
            count + element.querySelectorAll(":scope > li.heading-category-name").length,
          0,
        ),
        accountCount: elements.reduce(
          (count, element) => count + element.querySelectorAll(":scope > li.account").length,
          0,
        ),
        accountLinkCount: elements.reduce(
          (count, element) =>
            count +
            element.querySelectorAll(
              ":scope > li.account .heading-accounts a[href*='/accounts/show'], :scope > li.account a[href*='/accounts/edit/']",
            ).length,
          0,
        ),
      }));

      expect(structure.listCount).toBeGreaterThan(0);
      expect(structure.categoryHeadingCount).toBeGreaterThan(0);
      expect(structure.accountCount).toBeGreaterThan(0);
      expect(structure.accountLinkCount).toBeGreaterThan(0);
    });
  });
});
