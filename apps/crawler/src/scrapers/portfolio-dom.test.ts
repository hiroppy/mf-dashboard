import type { RegisteredAccounts } from "@mf-dashboard/db/types";
import { chromium, type Browser, type Page, type Route } from "playwright";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createManualHoldingKey } from "./manual-holding-accounts.js";
import {
  createPensionRowFingerprint,
  getLinkedAccountPensionSource,
  parseInsuranceAndPoints,
} from "./portfolio.js";

let browser: Browser;
let page: Page;

function pnsTable({
  category = "保険",
  name = "Manual Asset A",
  holdingMfId,
  subAccountMfId,
}: {
  category?: string;
  name?: string;
  holdingMfId?: string;
  subAccountMfId?: string;
}) {
  return `
    <h1 class="heading-normal">${category}</h1>
    <table class="table-pns">
      <tbody>
        <tr>
          <td>
            ${name}
            ${holdingMfId ? `<input name="user_asset_det[id]" value="${holdingMfId}" />` : ""}
            ${
              subAccountMfId
                ? `<input name="user_asset_det[sub_account_id_hash]" value="${subAccountMfId}" />`
                : ""
            }
          </td>
          <td>1,000</td>
          <td>3,000</td>
          <td>200</td>
          <td>10%</td>
          <td>unused</td>
          <td>Institution A</td>
          <td>unused</td>
        </tr>
      </tbody>
    </table>
  `;
}

function linkedAccounts(
  accounts: Array<{ mfId: string; type?: "手動" | "自動連携"; url?: string }>,
): RegisteredAccounts {
  return {
    accounts: accounts.map((account) => ({
      mfId: account.mfId,
      name: `Account ${account.mfId}`,
      type: account.type ?? "自動連携",
      status: "ok",
      lastUpdated: "2026-07-01",
      url: account.url ?? `/accounts/show/${account.mfId}`,
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

describe("parseInsuranceAndPoints", () => {
  test("完全一致する保有項目IDとsub-account IDからaccountMfIdを付与する", async () => {
    await page.setContent(pnsTable({ holdingMfId: "holding-a", subAccountMfId: "sub-account-a" }));
    const accountMap = new Map([
      [createManualHoldingKey("holding-a", "sub-account-a"), "manual-account-a"],
    ]);

    await expect(parseInsuranceAndPoints(page, accountMap)).resolves.toMatchObject([
      {
        mfId: "holding-a",
        subAccountMfId: "sub-account-a",
        accountMfId: "manual-account-a",
        name: "Manual Asset A",
        type: "保険",
      },
    ]);
  });

  test("0候補または片キー不一致ではaccountMfIdを付与しない", async () => {
    await page.setContent(pnsTable({ holdingMfId: "holding-a", subAccountMfId: "sub-account-a" }));
    const mismatchedMap = new Map([
      [createManualHoldingKey("holding-a", "sub-account-b"), "manual-account-a"],
    ]);

    const [withoutCandidate] = await parseInsuranceAndPoints(page);
    const [withMismatch] = await parseInsuranceAndPoints(page, mismatchedMap);

    expect(withoutCandidate).not.toHaveProperty("accountMfId");
    expect(withMismatch).not.toHaveProperty("accountMfId");
  });

  test("明示IDがない年金・ポイント行は従来どおり未解決でパースする", async () => {
    await page.setContent(
      [
        pnsTable({ category: "年金", name: "Pension A" }),
        pnsTable({ category: "ポイント", name: "Point A" }),
      ].join(""),
    );

    const result = await parseInsuranceAndPoints(page);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: "Pension A", type: "年金", institution: "" });
    expect(result[1]).toMatchObject({
      name: "Point A",
      type: "ポイント",
      institution: "Institution A",
    });
    expect(result[0]).not.toHaveProperty("accountMfId");
    expect(result[1]).not.toHaveProperty("accountMfId");
  });

  test("完全性が一致する場合は年金を通常口座詳細由来の項目で置換する", async () => {
    await page.setContent(pnsTable({ category: "年金", name: "Pension A" }));
    const pensionCells = ["Pension A", "1,000", "3,000", "200", "10%", "unused"];

    const result = await parseInsuranceAndPoints(page, new Map(), {
      complete: true,
      fingerprints: [createPensionRowFingerprint(pensionCells)],
      items: [
        {
          accountMfId: "linked-account-a",
          name: "Pension A",
          type: "年金",
          institution: "",
          balance: 3000,
        },
      ],
    });

    expect(result).toEqual([
      expect.objectContaining({
        accountMfId: "linked-account-a",
        name: "Pension A",
        type: "年金",
      }),
    ]);
  });

  test.each([
    [
      "主要6列のmultiset不一致",
      true,
      ["Different Pension", "1,000", "3,000", "200", "10%", "unused"],
    ],
    ["通常口座詳細の取得不完全", false, ["Pension A", "1,000", "3,000", "200", "10%", "unused"]],
  ])("%sではglobal年金をunknownのまま保持する", async (_label, complete, detailCells) => {
    await page.setContent(pnsTable({ category: "年金", name: "Pension A" }));

    const result = await parseInsuranceAndPoints(page, new Map(), {
      complete,
      fingerprints: [createPensionRowFingerprint(detailCells)],
      items: [
        {
          accountMfId: "linked-account-a",
          name: "Pension A",
          type: "年金",
          institution: "",
          balance: 3000,
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Pension A", type: "年金" });
    expect(result[0]).not.toHaveProperty("accountMfId");
  });
});

describe("getLinkedAccountPensionSource", () => {
  test("検証済みshow詳細の年金行へページのaccountMfIdを直接付与する", async () => {
    await page.route("https://moneyforward.com/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/accounts/show/linked-account-a") {
        await route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: pnsTable({ category: "年金", name: "Pension A" }),
        });
        return;
      }
      await route.fulfill({ status: 404, body: "" });
    });

    const result = await getLinkedAccountPensionSource(
      page,
      linkedAccounts([
        { mfId: "linked-account-a" },
        { mfId: "manual-account-a", type: "手動", url: "/accounts/show_manual/manual-account-a" },
        { mfId: "stale-account-a", url: "" },
      ]),
    );

    expect(result.complete).toBe(true);
    expect(result.items).toEqual([
      expect.objectContaining({
        accountMfId: "linked-account-a",
        name: "Pension A",
        type: "年金",
      }),
    ]);
    expect(result.fingerprints).toEqual([
      createPensionRowFingerprint(["Pension A", "1,000", "3,000", "200", "10%", "unused"]),
    ]);
  });

  test.each([
    [
      "リダイレクト",
      async (route: Route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/accounts/show/linked-account-a") {
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
      "主要列不足",
      async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: `
            <h1 class="heading-normal">年金</h1>
            <table class="table-pns"><tbody><tr><td>Pension A</td></tr></tbody></table>
          `,
        });
      },
    ],
  ])("%sでは通常口座年金ソースを不完全とする", async (_label, handler) => {
    await page.route("https://moneyforward.com/**", handler);

    const result = await getLinkedAccountPensionSource(
      page,
      linkedAccounts([{ mfId: "linked-account-a" }]),
    );

    expect(result.complete).toBe(false);
  });
});
