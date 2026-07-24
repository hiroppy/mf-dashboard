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
- [ ] Add unit tests for parsers

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

### Test Types

| Type | When to Use                                               | Location                       |
| ---- | --------------------------------------------------------- | ------------------------------ |
| Unit | Service-independent logic (parsers, data transformations) | `*.test.ts` next to source     |
| E2E  | Requires actual account/service interaction               | `vitest.config.ts` e2e project |

### Rules (MUST follow)

- **NEVER write tests that depend on actual data** (personal financial data changes constantly)
- Unit tests: Use hardcoded mock strings, not real scraped data
- E2E tests: Only verify page navigation and element existence, not actual values

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
