import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Page } from "playwright";
import { debug } from "../logger.js";

export type InstitutionCategoryEntry =
  | { type: "account"; mfId: string | null }
  | { type: "category"; category: string };

/**
 * Passed to page.evaluate() — must be self-contained (no external references).
 */
function extractInstitutionCategoryEntries(): InstitutionCategoryEntry[][] {
  const accountsLists = document.querySelectorAll(".facilities.accounts-list");
  const lists: InstitutionCategoryEntry[][] = [];

  for (const accountsList of accountsLists) {
    const entries: InstitutionCategoryEntry[] = [];

    for (const child of accountsList.children) {
      if (child.classList.contains("heading-category-name")) {
        entries.push({
          type: "category",
          category: child.textContent?.trim() || "",
        });
        continue;
      }

      if (child.classList.contains("account")) {
        const showLink = child.querySelector<HTMLAnchorElement>(
          ".heading-accounts a[href*='/accounts/show']",
        );
        const editLink = child.querySelector<HTMLAnchorElement>("a[href*='/accounts/edit/']");
        const href = (showLink || editLink)?.getAttribute("href") || "";
        const match = href.match(/\/accounts\/(?:show(?:_manual)?|edit)\/([^/?]+)/);
        entries.push({ type: "account", mfId: match?.[1] || null });
      }
    }

    lists.push(entries);
  }

  return lists;
}

export function associateInstitutionCategories(
  lists: readonly (readonly InstitutionCategoryEntry[])[],
): Array<{ mfId: string; category: string }> {
  const results: Array<{ mfId: string; category: string }> = [];

  for (const entries of lists) {
    let currentCategory = "";

    for (const entry of entries) {
      if (entry.type === "category") {
        currentCategory = entry.category;
      } else if (entry.mfId && currentCategory) {
        results.push({ mfId: entry.mfId, category: currentCategory });
      }
    }
  }

  return results;
}

/**
 * Extract institution categories from the top page sidebar
 * Returns a map of mfId -> category name
 */
export async function scrapeInstitutionCategories(page: Page): Promise<Map<string, string>> {
  debug("Scraping institution categories from top page...");

  await page.goto(mfUrls.home, { waitUntil: "domcontentloaded" });
  await page.locator(".facilities.accounts-list").first().waitFor({ state: "attached" });

  const entries = await page.evaluate(extractInstitutionCategoryEntries);
  const categoryData = associateInstitutionCategories(entries);

  debug(`  - Found ${categoryData.length} accounts with category information`);

  // Log category distribution
  const categoryCount = new Map<string, number>();
  for (const item of categoryData) {
    categoryCount.set(item.category, (categoryCount.get(item.category) || 0) + 1);
  }

  debug("  - Category distribution:");
  for (const [category, count] of categoryCount.entries()) {
    debug(`    - ${category}: ${count}`);
  }

  // Convert to Map
  const categoryMap = new Map<string, string>();
  for (const item of categoryData) {
    categoryMap.set(item.mfId, item.category);
  }

  return categoryMap;
}
