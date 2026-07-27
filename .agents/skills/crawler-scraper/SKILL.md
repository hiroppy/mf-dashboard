---
name: crawler-scraper
description: Use when adding new scraping targets to the crawler
---

# Crawler Scraper Skill

## Checklist (MUST complete all)

- [ ] Add URL to `packages/meta/src/urls.ts`
- [ ] Create scraper function in `apps/crawler/src/scrapers/`
- [ ] Define types in `packages/db/src/types.ts`
- [ ] Add repository if new data storage needed
- [ ] Integrate into `apps/crawler/src/index.ts`
- [ ] Add DOM-independent unit tests for parser decisions and transformations
- [ ] Add authenticated read-only E2E coverage when selectors, navigation, or page structure change

## File Locations

| Purpose      | Location                         |
| ------------ | -------------------------------- |
| URLs         | `packages/meta/src/urls.ts`      |
| Scrapers     | `apps/crawler/src/scrapers/*.ts` |
| Types        | `packages/db/src/types.ts`       |
| Repositories | `packages/db/src/repositories/`  |
| Parsers      | `apps/crawler/src/parsers.ts`    |
| Entry point  | `apps/crawler/src/index.ts`      |

## Template

```typescript
// apps/crawler/src/scrapers/my-feature.ts
import type { MyData } from "@mf-dashboard/db/types";
import type { Page } from "playwright";
import { mfUrls } from "@mf-dashboard/meta";
import { debug } from "../logger.js";
import { parseJapaneseNumber } from "../parsers.js";

export async function getMyData(page: Page): Promise<MyData> {
  debug("Getting my data from /path...");

  await page.goto(mfUrls.myFeature, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  // Scraping logic here...
  const rows = page.locator("table tbody tr");
  const count = await rows.count();

  const results: MyItem[] = [];
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const text = await row
      .locator("td")
      .first()
      .textContent({ timeout: 1000 })
      .catch(() => "");

    results.push({
      // parsed data
    });
  }

  return { items: results };
}
```

## URL Registration

```typescript
// packages/meta/src/urls.ts
export const mfUrls = {
  // existing urls...
  myFeature: "https://moneyforward.com/path/to/feature",
};
```

## Testing

### Test Types and Priority

| Priority | Type                   | When to Use                                                                                                               | Location                                          |
| -------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1        | Unit                   | Post-extraction parsing, normalization, comparison, mapping, and fail-closed decisions using anonymous strings or objects | `*.test.ts` next to source                        |
| 2        | E2E                    | Selectors, navigation, and required HTML/DOM structure on the authenticated real service                                  | `tests/e2e/*.test.ts` in the `e2e` Vitest project |
| 3        | HTML fixture exception | A failure branch that cannot be produced safely and deterministically against the real service                            | The narrowest applicable unit test                |

### Rules (MUST follow)

- Extract DOM values into strings or objects, then test the resulting pure transformation and decision logic without Playwright or embedded HTML.
- Verify selector compatibility and page structure with authenticated **read-only** E2E tests. Do not trigger refresh, account updates, crawling, or database writes in structure-only E2E tests.
- **NEVER write assertions that depend on actual financial data.** Do not assert or log real names, balances, account IDs, or other personal values.
- E2E assertions may check navigation and structural properties only, including the presence and shape of headings, tables, rows, cells, attributes, and links.
- Bound structure-only E2E navigation independently from production crawl coverage. If production scans every account for correctness, inspect at most one representative detail page in E2E, skip when no suitable candidate exists, and document the scope difference in the test and pull request.
- Do not use embedded HTML fixtures merely to imitate the current service DOM. They are allowed only when a failure branch cannot be represented safely and deterministically in read-only E2E.
- For every HTML fixture exception, keep the markup to the minimum needed and add a nearby comment explaining why authenticated read-only E2E cannot cover that branch.
- Use anonymous hardcoded strings and objects for unit tests; never copy values from the production database or authenticated pages.

### Running Tests

- Unit: `pnpm --filter @mf-dashboard/crawler test`
- E2E: `pnpm --filter @mf-dashboard/crawler test:e2e`
- Local manual testing: `SKIP_REFRESH=true pnpm --filter @mf-dashboard/crawler start`
- Debug scripts go in `debug/` directory
- Screenshots saved to `debug/` directory

## Notes

- Use `parseJapaneseNumber()` for Japanese currency format (e.g., "1,234円" → 1234)
- Use `debug()` from logger for debug output
- Handle missing elements gracefully with `.catch(() => defaultValue)`
- Always use `{ timeout: 1000 }` for individual element queries to avoid hanging
