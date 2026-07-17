import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Page } from "playwright";
import type { CategoryCandidate } from "../category-decision/types.js";
import { debug } from "../logger.js";

/**
 * Passed to page.evaluate() — must be self-contained (no external references).
 */
export function parseCategoryCandidates(): CategoryCandidate[] {
  const candidates: CategoryCandidate[] = [];
  const seen = new Set<string>();
  const largeCategoryItems = document.querySelectorAll<HTMLElement>(
    "#category-settings li.dropdown-submenu",
  );

  for (const item of largeCategoryItems) {
    const largeCategory = item.querySelector<HTMLElement>(":scope > a.dropdown-toggle[id]");
    if (!largeCategory) continue;

    const largeCategoryId = largeCategory.id;
    const largeCategoryName = (largeCategory.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!largeCategoryId || !largeCategoryName) continue;

    const middleCategoryItems = item.querySelectorAll<HTMLElement>(
      ":scope > ul.sub_menu > li[id^='js-middle-category-li-']",
    );

    for (const middleItem of middleCategoryItems) {
      const middleCategoryId = middleItem.id.replace("js-middle-category-li-", "");
      const middleCategory = middleItem.querySelector<HTMLElement>(
        ":scope > .middle_category_default, :scope > .middle_category_user",
      );
      const middleCategoryName = (middleCategory?.textContent ?? "").replace(/\s+/g, " ").trim();
      const key = `${largeCategoryId}:${middleCategoryId}`;

      if (!middleCategoryId || !middleCategoryName || seen.has(key)) {
        continue;
      }

      seen.add(key);
      candidates.push({
        largeCategoryId,
        largeCategoryName,
        middleCategoryId,
        middleCategoryName,
        isIncome: largeCategoryId === "1" || largeCategoryName === "収入",
      });
    }
  }

  return candidates;
}

export async function scrapeCategoryCandidates(page: Page): Promise<CategoryCandidate[]> {
  await page.goto(mfUrls.categoryRules, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.locator("#category-settings").waitFor({ state: "visible", timeout: 30000 });

  const candidates = await page.evaluate(parseCategoryCandidates);
  debug(`Category candidates: ${candidates.length}`);
  return candidates;
}
