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

describe("accounts page structure", () => {
  test("更新状態の取得に必要な実HTML構造が存在する", async () => {
    await withNewPage(context, async (page) => {
      await page.goto(mfUrls.accounts, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      const accountTable = page.locator("#account-table");
      await accountTable.waitFor({ state: "visible", timeout: 30000 });
      const rows = accountTable.locator("tr:has(td.account-status)");
      const structure = await rows.evaluateAll((elements) => ({
        rowCount: elements.length,
        rowsWithServiceLink: elements.filter((row) => row.querySelector("td.service a")).length,
        rowsWithStatus: elements.filter((row) => row.querySelector("td.account-status")).length,
      }));

      expect(structure.rowCount).toBeGreaterThan(0);
      expect(structure.rowsWithServiceLink).toBe(structure.rowCount);
      expect(structure.rowsWithStatus).toBe(structure.rowCount);
    });
  });
});
