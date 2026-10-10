import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Browser, BrowserContext } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { readHoldingAccountFingerprints } from "../../src/scrapers/holding-account-references.js";
import { selectLinkedPnsAccounts } from "../../src/scrapers/portfolio.js";
import { getRegisteredAccounts } from "../../src/scrapers/registered-accounts.js";
import { launchLoggedInContext, withNewPage } from "./helpers.js";

let browser: Browser;
let context: BrowserContext;
beforeAll(async () => ({ browser, context } = await launchLoggedInContext()));
afterAll(async () => {
  await context?.close();
  await browser?.close();
});

describe("holding account reference structure", () => {
  test("portfolio rows expose the columns needed for reference matching", async () => {
    await withNewPage(context, async (page) => {
      await page.goto(mfUrls.portfolio, { waitUntil: "domcontentloaded" });
      await page.locator("h1.heading-normal").first().waitFor();
      const fingerprints = await readHoldingAccountFingerprints(page);
      expect(fingerprints.length).toBeGreaterThan(0);
      expect(fingerprints.every((key) => key.startsWith('["table-'))).toBe(true);
    });
  });

  test("one representative linked detail page exposes compatible holding tables", async ({
    skip,
  }) => {
    await withNewPage(context, async (page) => {
      const registered = await getRegisteredAccounts(page);
      const candidates = selectLinkedPnsAccounts(registered);
      // Production checks every linked account. This read-only structure test is
      // bounded to one representative page and never asserts financial values.
      const account =
        candidates.find((a) => candidates.some((b) => b.mfId !== a.mfId && b.name === a.name)) ??
        candidates[0];
      if (!account) {
        skip();
        return;
      }
      const response = await page.goto(mfUrls.accountDetail(account.mfId), {
        waitUntil: "domcontentloaded",
      });
      expect(response?.ok()).toBe(true);
      expect(new URL(page.url()).pathname.startsWith("/accounts/show/")).toBe(true);
      const fingerprints = await readHoldingAccountFingerprints(page);
      if (fingerprints.length === 0) {
        skip();
        return;
      }
      expect(fingerprints.every((key) => key.startsWith('["table-'))).toBe(true);
    });
  });
});
