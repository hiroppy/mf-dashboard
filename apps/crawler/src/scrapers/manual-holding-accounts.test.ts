import type { RegisteredAccounts } from "@mf-dashboard/db/types";
import { chromium, type Browser, type Page, type Route } from "playwright";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  buildUniqueManualHoldingAccountMap,
  createManualHoldingKey,
  extractManualHoldingReferences,
  getManualHoldingAccountMap,
} from "./manual-holding-accounts.js";

let browser: Browser;
let page: Page;

function detailHtml(accountMfId: string, holdingMfId = "holding-a", subAccountMfId = "sub-a") {
  return `
    <html>
      <body>
        <input name="account[id_hash]" value="${accountMfId}" />
        <table class="table-pns">
          <tbody>
            <tr>
              <td>
                Manual Asset A
                <input name="user_asset_det[id]" value="${holdingMfId}" />
                <input name="user_asset_det[sub_account_id_hash]" value="${subAccountMfId}" />
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  `;
}

function registeredAccounts(
  accounts: Array<{ mfId: string; url?: string; type?: string }>,
): RegisteredAccounts {
  return {
    accounts: accounts.map((account) => ({
      mfId: account.mfId,
      name: `Account ${account.mfId}`,
      type: account.type ?? "手動",
      status: "ok",
      lastUpdated: "2026-07-01",
      url: account.url ?? `/accounts/show_manual/${account.mfId}`,
      totalAssets: 0,
    })),
  };
}

beforeAll(async () => {
  browser = await chromium.launch();
});

beforeEach(async () => {
  page = await browser.newPage();
});

afterAll(async () => {
  await browser.close();
});

afterEach(async () => {
  await page.close();
});

describe("extractManualHoldingReferences", () => {
  test("匿名DOMから保有項目ID・sub-account ID・ページ口座mfIdを抽出する", async () => {
    await page.setContent(detailHtml("manual-account-a"));

    await expect(extractManualHoldingReferences(page, "manual-account-a")).resolves.toEqual([
      {
        holdingMfId: "holding-a",
        subAccountMfId: "sub-a",
        accountMfId: "manual-account-a",
      },
    ]);
  });

  test.each([
    ["ページ口座ID不一致", detailHtml("manual-account-b")],
    [
      "保有項目IDなし",
      detailHtml("manual-account-a").replace('name="user_asset_det[id]"', 'name="other[id]"'),
    ],
    [
      "sub-account IDなし",
      detailHtml("manual-account-a").replace(
        'name="user_asset_det[sub_account_id_hash]"',
        'name="other[sub_account_id_hash]"',
      ),
    ],
  ])("%sの行を候補にしない", async (_label, html) => {
    await page.setContent(html);

    await expect(extractManualHoldingReferences(page, "manual-account-a")).resolves.toEqual([]);
  });
});

describe("buildUniqueManualHoldingAccountMap", () => {
  test("同じ明示キーに複数口座候補がある場合は解決しない", () => {
    const result = buildUniqueManualHoldingAccountMap([
      {
        holdingMfId: "holding-a",
        subAccountMfId: "sub-a",
        accountMfId: "manual-account-a",
      },
      {
        holdingMfId: "holding-a",
        subAccountMfId: "sub-a",
        accountMfId: "manual-account-b",
      },
    ]);

    expect(result.size).toBe(0);
  });

  test("同じ口座内の重複行は一意な候補として扱う", () => {
    const reference = {
      holdingMfId: "holding-a",
      subAccountMfId: "sub-a",
      accountMfId: "manual-account-a",
    };

    expect(buildUniqueManualHoldingAccountMap([reference, reference])).toEqual(
      new Map([[createManualHoldingKey("holding-a", "sub-a"), "manual-account-a"]]),
    );
  });
});

describe("getManualHoldingAccountMap", () => {
  test("今回取得した手動口座の正常な詳細だけを一意マップへ含める", async () => {
    await page.route("https://moneyforward.com/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/accounts/show_manual/manual-account-a") {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: detailHtml("manual-account-a"),
        });
        return;
      }
      await route.fulfill({ status: 404, body: "" });
    });

    const result = await getManualHoldingAccountMap(
      page,
      registeredAccounts([
        { mfId: "manual-account-a" },
        { mfId: "stale-account-a", url: "" },
        { mfId: "linked-account-a", type: "自動連携", url: "/accounts/show/linked-account-a" },
      ]),
    );

    expect(result).toEqual(
      new Map([[createManualHoldingKey("holding-a", "sub-a"), "manual-account-a"]]),
    );
  });

  test.each([
    [
      "リダイレクト",
      async (route: Route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/accounts/show_manual/manual-account-a") {
          await route.fulfill({
            status: 302,
            headers: { location: "https://moneyforward.com/" },
          });
          return;
        }
        await route.fulfill({ status: 200, contentType: "text/html", body: "<html></html>" });
      },
    ],
    [
      "表なし",
      async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "text/html", body: "<html></html>" });
      },
    ],
  ])("%sの詳細は解決しない", async (_label, handler) => {
    await page.route("https://moneyforward.com/**", handler);

    const result = await getManualHoldingAccountMap(
      page,
      registeredAccounts([{ mfId: "manual-account-a" }]),
    );

    expect(result.size).toBe(0);
  });

  test("同じ明示キーを返す詳細が複数ある場合は解決しない", async () => {
    await page.route("https://moneyforward.com/**", async (route) => {
      const accountMfId = new URL(route.request().url()).pathname.split("/").at(-1) ?? "";
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: detailHtml(accountMfId),
      });
    });

    const result = await getManualHoldingAccountMap(
      page,
      registeredAccounts([{ mfId: "manual-account-a" }, { mfId: "manual-account-b" }]),
    );

    expect(result.size).toBe(0);
  });
});
