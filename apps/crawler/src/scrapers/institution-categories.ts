import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Page } from "playwright";
import { debug } from "../logger.js";

/**
 * Parse institution categories from the DOM.
 * Passed to page.evaluate() — must be self-contained (no external references).
 */
export function parseInstitutionCategories(): Array<{
  mfId: string;
  category: string;
}> {
  const results: Array<{ mfId: string; category: string }> = [];

  // There are multiple .facilities.accounts-list elements on the page:
  // one for manual accounts and one for auto-linked accounts
  const accountsLists = document.querySelectorAll(".facilities.accounts-list");

  for (const accountsList of accountsLists) {
    let currentCategory = "";

    for (const child of accountsList.children) {
      if (child.classList.contains("heading-category-name")) {
        currentCategory = child.textContent?.trim() || "";
        continue;
      }

      if (child.classList.contains("account")) {
        // Try account name link first (/accounts/show/ or /accounts/show_manual/)
        // Some accounts (e.g. 携帯) have no name link; fall back to edit link
        const showLink = child.querySelector<HTMLAnchorElement>(
          ".heading-accounts a[href*='/accounts/show']",
        );
        const editLink = child.querySelector<HTMLAnchorElement>("a[href*='/accounts/edit/']");
        const accountLink = showLink || editLink;
        if (!accountLink) continue;

        const href = accountLink.getAttribute("href") || "";
        const match = href.match(/\/accounts\/(?:show(?:_manual)?|edit)\/([^/?]+)/);
        if (match && match[1] && currentCategory) {
          results.push({
            mfId: match[1],
            category: currentCategory,
          });
        }
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

  const categoryData = await page.evaluate(parseInstitutionCategories);

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
