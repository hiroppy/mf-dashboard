import { EXPENSE_LARGE_CATEGORIES } from "@mf-dashboard/meta/categories";
import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Browser, BrowserContext } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { scrapeCategoryCandidates } from "../../src/scrapers/category-candidates.js";
import { launchLoggedInContext, withErrorScreenshot, withNewPage } from "./helpers.js";

interface MappingCheck {
  id: string;
  existsInApp: boolean;
  nameMatches: boolean;
}

interface CategoryCandidateMapping {
  largeCategoryId: string;
  largeCategoryName: string;
  middleCategoryId: string;
  middleCategoryName: string;
  isIncome: boolean;
}

interface CandidateMappingCheck {
  id: string;
  existsInHtml: boolean;
  existsInApp: boolean;
  largeCategoryNameMatches: boolean;
  middleCategoryNameMatches: boolean;
  typeMatches: boolean;
}

let browser: Browser;
let context: BrowserContext;

beforeAll(async () => {
  ({ browser, context } = await launchLoggedInContext());
});

afterAll(async () => {
  await context?.close();
  await browser?.close();
});

describe("Money Forward category mapping", () => {
  test("実HTMLにあるすべての支出大カテゴリがアプリ内のマッピングに含まれる", async () => {
    await withNewPage(context, async (page) => {
      await page.goto(mfUrls.spendingTargets, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      const rows = page.locator("table.table-bordered tbody tr.large_category");
      await rows.first().waitFor({ state: "visible", timeout: 30000 });

      await withErrorScreenshot(page, "category-mapping-test-error.png", async () => {
        const appNamesById = Object.fromEntries(
          EXPENSE_LARGE_CATEGORIES.map((category) => [String(category.id), category.name]),
        );
        const checks = await rows.evaluateAll(
          (elements, categoryNames): MappingCheck[] =>
            elements.map((element) => {
              const input = element.querySelector<HTMLInputElement>(
                "input[name='spending_targets[][large_category_id]']",
              );
              const id = input?.value ?? "";
              const expectedName = categoryNames[id];
              const displayedText = (element.textContent ?? "").replace(/\s+/g, " ").trim();

              return {
                id,
                existsInApp: typeof expectedName === "string",
                nameMatches:
                  typeof expectedName === "string" && displayedText.includes(expectedName),
              };
            }),
          appNamesById,
        );

        expect(checks.length).toBeGreaterThan(0);
        expect(checks).toEqual(
          checks.map(({ id }) => ({ id, existsInApp: true, nameMatches: true })),
        );
      });
    });
  });

  test("実HTMLにあるすべての大・中カテゴリの組が動的マッピングに含まれる", async () => {
    await withNewPage(context, async (page) => {
      await page.goto(mfUrls.categoryRules, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.locator("#category-settings").waitFor({ state: "visible", timeout: 30000 });

      await withErrorScreenshot(page, "category-candidate-mapping-test-error.png", async () => {
        const htmlMappings = await page.evaluate((): CategoryCandidateMapping[] => {
          const mappings: CategoryCandidateMapping[] = [];
          const cleanText = (value: string | null): string =>
            (value ?? "").replace(/\s+/g, " ").trim();

          for (const item of document.querySelectorAll<HTMLElement>(
            "#category-settings li.dropdown-submenu",
          )) {
            const largeCategory = item.querySelector<HTMLElement>(":scope > a.dropdown-toggle[id]");
            if (!largeCategory) continue;

            for (const middleItem of item.querySelectorAll<HTMLElement>(
              ":scope > ul.sub_menu > li[id^='js-middle-category-li-']",
            )) {
              const middleCategory = middleItem.querySelector<HTMLElement>(
                ":scope > .middle_category_default, :scope > .middle_category_user",
              );
              mappings.push({
                largeCategoryId: largeCategory.id,
                largeCategoryName: cleanText(largeCategory.textContent),
                middleCategoryId: middleItem.id.replace("js-middle-category-li-", ""),
                middleCategoryName: cleanText(middleCategory?.textContent ?? null),
                isIncome: largeCategory.id === "1",
              });
            }
          }

          return mappings;
        });

        const candidates = await scrapeCategoryCandidates(page);
        const htmlById = new Map(
          htmlMappings.map((mapping) => [
            `${mapping.largeCategoryId}:${mapping.middleCategoryId}`,
            mapping,
          ]),
        );
        const appById = new Map(
          candidates.map((mapping) => [
            `${mapping.largeCategoryId}:${mapping.middleCategoryId}`,
            mapping,
          ]),
        );
        const ids = new Set([...htmlById.keys(), ...appById.keys()]);
        const checks: CandidateMappingCheck[] = [...ids].map((id) => {
          const html = htmlById.get(id);
          const app = appById.get(id);
          return {
            id,
            existsInHtml: Boolean(html),
            existsInApp: Boolean(app),
            largeCategoryNameMatches: html?.largeCategoryName === app?.largeCategoryName,
            middleCategoryNameMatches: html?.middleCategoryName === app?.middleCategoryName,
            typeMatches: html?.isIncome === app?.isIncome,
          };
        });

        expect(htmlMappings.length).toBeGreaterThan(0);
        expect(new Set(htmlMappings.map((mapping) => mapping.isIncome))).toEqual(
          new Set([false, true]),
        );
        expect(checks).toEqual(
          checks.map(({ id }) => ({
            id,
            existsInHtml: true,
            existsInApp: true,
            largeCategoryNameMatches: true,
            middleCategoryNameMatches: true,
            typeMatches: true,
          })),
        );
      });
    });
  });
});
