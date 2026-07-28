import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Page } from "playwright";
import type { CategoryCandidate } from "../category-decision/types.js";
import { debug } from "../logger.js";

export interface ExtractedCategoryCandidate {
  largeCategoryId: string;
  largeCategoryName: string;
  middleCategoryId: string;
  middleCategoryName: string;
}

/**
 * Passed to page.evaluate() — must be self-contained (no external references).
 */
function extractCategoryCandidates(): ExtractedCategoryCandidate[] {
  const candidates: ExtractedCategoryCandidate[] = [];
  const largeCategoryItems = document.querySelectorAll<HTMLElement>(
    "#category-settings li.dropdown-submenu",
  );

  for (const item of largeCategoryItems) {
    const largeCategory = item.querySelector<HTMLElement>(":scope > a.dropdown-toggle[id]");
    if (!largeCategory) continue;

    const largeCategoryId = largeCategory.id;
    const largeCategoryName = (largeCategory.textContent ?? "").replace(/\s+/g, " ").trim();

    const middleCategoryItems = item.querySelectorAll<HTMLElement>(
      ":scope > ul.sub_menu > li[id^='js-middle-category-li-']",
    );

    for (const middleItem of middleCategoryItems) {
      const middleCategoryId = middleItem.id.replace("js-middle-category-li-", "");
      const middleCategory = middleItem.querySelector<HTMLElement>(
        ":scope > .middle_category_default, :scope > .middle_category_user",
      );
      const middleCategoryName = (middleCategory?.textContent ?? "").replace(/\s+/g, " ").trim();
      candidates.push({
        largeCategoryId,
        largeCategoryName,
        middleCategoryId,
        middleCategoryName,
      });
    }
  }

  return candidates;
}

export function buildCategoryCandidates(
  extracted: readonly ExtractedCategoryCandidate[],
): CategoryCandidate[] {
  const candidates: CategoryCandidate[] = [];
  const seen = new Set<string>();

  for (const candidate of extracted) {
    const { largeCategoryId, largeCategoryName, middleCategoryId, middleCategoryName } = candidate;
    const key = `${largeCategoryId}:${middleCategoryId}`;

    if (
      !largeCategoryId ||
      !largeCategoryName ||
      !middleCategoryId ||
      !middleCategoryName ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    candidates.push({
      ...candidate,
      isIncome: largeCategoryId === "1" || largeCategoryName === "収入",
    });
  }

  return candidates;
}

export async function scrapeCategoryCandidates(page: Page): Promise<CategoryCandidate[]> {
  await page.goto(mfUrls.categoryRules, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.locator("#category-settings").waitFor({ state: "visible", timeout: 30000 });

  const extracted = await page.evaluate(extractCategoryCandidates);
  const candidates = buildCategoryCandidates(extracted);
  debug(`Category candidates: ${candidates.length}`);
  return candidates;
}
