import { expect, type Page, test } from "@playwright/test";

async function expectHeading(page: Page, name: string | RegExp) {
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

function normalizePathname(pathname: string) {
  return pathname === "/" ? pathname : pathname.replace(/\/$/, "");
}

async function expectLocation(page: Page, pathname: string, search = "") {
  await expect.poll(() => normalizePathname(new URL(page.url()).pathname)).toBe(pathname);
  await expect.poll(() => new URL(page.url()).search).toBe(search);
}

async function navigateFromMenu(page: Page, name: string) {
  const menuButton = page.getByRole("button", { name: "メニューを開く" });

  if (await menuButton.isVisible()) {
    await menuButton.click();
  }

  await page.getByRole("link", { name, exact: true }).click();
}

test.describe("App flows", () => {
  test("renders primary chart pages without release warnings", async ({ page }) => {
    const releaseWarnings: string[] = [];
    const warningPatterns = [
      "metadataBase property in metadata export is not set",
      "of chart should be greater than 0",
      "has either width or height modified, but not the other",
    ];

    page.on("console", (message) => {
      if (
        message.type() === "warning" &&
        warningPatterns.some((pattern) => message.text().includes(pattern))
      ) {
        releaseWarnings.push(message.text());
      }
    });

    const chartPages = [
      { path: "/", heading: "ダッシュボード" },
      { path: "/cf", heading: "収支" },
      { path: "/bs", heading: "資産" },
      { path: "/insights", heading: "インサイト" },
      { path: "/simulator", heading: "シミュレーター" },
    ];

    for (const { path, heading } of chartPages) {
      await page.goto(path);
      await expectHeading(page, heading);
    }

    expect(releaseWarnings).toEqual([]);
  });

  test("navigates between primary pages from the sidebar", async ({ page }) => {
    await page.goto("/");
    await expectHeading(page, "ダッシュボード");

    const destinations = [
      { link: "収支", path: "/cf", heading: "収支" },
      { link: "資産", path: "/bs", heading: "資産" },
      { link: "インサイト", path: "/insights", heading: "インサイト" },
      { link: "連携サービス", path: "/accounts", heading: "連携サービス一覧" },
      { link: "シミュレーター", path: "/simulator", heading: "シミュレーター" },
      { link: "ダッシュボード", path: "/", heading: "ダッシュボード" },
    ] as const;

    for (const { link, path, heading } of destinations) {
      await test.step(`Navigate to ${heading}`, async () => {
        await navigateFromMenu(page, link);
        await expectLocation(page, path);
        await expectHeading(page, heading);
      });
    }
  });

  test("keeps navigation in the selected group context", async ({ page }) => {
    await page.goto("/cf");
    await expectHeading(page, "収支");

    await page.getByRole("combobox", { name: "グループを選択" }).click();
    await page.getByRole("option", { name: "投資" }).click();

    await expectLocation(page, "/demo_group_001/cf");
    await expectHeading(page, "収支");
    await expect(page.getByRole("combobox", { name: "グループを選択" })).toContainText("投資");

    const destinations = [
      { link: "資産", path: "/demo_group_001/bs", heading: "資産" },
      {
        link: "インサイト",
        path: "/demo_group_001/insights",
        heading: "財務インサイト",
      },
      {
        link: "連携サービス",
        path: "/demo_group_001/accounts",
        heading: "連携サービス一覧",
      },
      {
        link: "シミュレーター",
        path: "/demo_group_001/simulator",
        heading: "シミュレーター",
      },
      {
        link: "ダッシュボード",
        path: "/demo_group_001",
        heading: "ダッシュボード",
      },
      { link: "収支", path: "/demo_group_001/cf", heading: "収支" },
    ] as const;

    for (const { link, path, heading } of destinations) {
      await test.step(`Keep group context while navigating to ${heading}`, async () => {
        await navigateFromMenu(page, link);
        await expectLocation(page, path);
        await expectHeading(page, heading);
      });
    }

    await page.getByRole("combobox", { name: "グループを選択" }).click();
    await page.getByRole("option", { name: "グループ選択なし" }).click();

    await expectLocation(page, "/cf");
    await expectHeading(page, "収支");
  });

  test("uses cash-flow tabs and monthly navigation", async ({ page }) => {
    await page.goto("/cf");
    await expectHeading(page, "収支");
    await expect(page.getByText("累計収入").first()).toBeVisible();

    await page.getByRole("button", { name: "詳細一覧" }).click();
    await expectLocation(page, "/cf", "?tab=transactions");
    await expect(page.getByText("詳細一覧").first()).toBeVisible();
    await expect(page.getByPlaceholder("検索...")).toBeVisible();

    await page.getByRole("button", { name: "サマリー" }).click();
    await expectLocation(page, "/cf");

    await page.locator('a[href="/cf/2025-12/"]').click();
    await expectLocation(page, "/cf/2025-12");
    await expectHeading(page, "収支 - 2025年12月");
    await expect(page.getByRole("combobox", { name: "月を選択" })).toContainText("2025年12月");

    await page.getByRole("link", { name: "前の月" }).click();
    await expectLocation(page, "/cf/2025-11");
    await expectHeading(page, "収支 - 2025年11月");
  });

  test("disables monthly navigation at the available date boundaries", async ({ page }) => {
    await page.goto("/cf/2025-02");
    await expectHeading(page, "収支 - 2025年2月");
    await expect(page.getByRole("link", { name: "前の月" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(page.getByRole("link", { name: "次の月" })).toHaveAttribute(
      "aria-disabled",
      "false",
    );

    await page.goto("/cf");
    const monthHrefs = await page.locator('a[href^="/cf/"]').evaluateAll((links) =>
      links
        .map((link) => link.getAttribute("href"))
        .filter((href): href is string => href !== null && /^\/cf\/\d{4}-\d{2}\/$/.test(href))
        .sort(),
    );
    const latestMonthHref = monthHrefs.at(-1);
    if (!latestMonthHref) {
      throw new Error("Expected at least one monthly cash-flow link");
    }

    await page.goto(latestMonthHref);
    await expect(page.getByRole("link", { name: "次の月" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(page.getByRole("link", { name: "前の月" })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
  });

  test("opens account details from the accounts overview", async ({ page }) => {
    await page.goto("/accounts");
    await expectHeading(page, "連携サービス一覧");
    await expect(page.getByText("正常:")).toBeVisible();
    await expect(page.getByText("エラー: 1件")).toBeVisible();

    await page.getByRole("link", { name: /三井住友銀行/ }).click();
    await expectLocation(page, "/accounts/demo_000001");
    await expectHeading(page, "三井住友銀行");
    await expect(page.getByText("普通預金").first()).toBeVisible();
    await expect(page.getByText("詳細一覧").first()).toBeVisible();

    await page.goto("/accounts");
    await page.getByRole("link", { name: /三井住友カード\(NL\)/ }).click();
    await expectLocation(page, "/accounts/demo_000007");
    await expectHeading(page, "三井住友カード(NL)");
    await expect(page.getByText("金融機関のメンテナンス中")).toBeVisible();
  });

  test("opens account details without leaving the selected group", async ({ page }) => {
    await page.goto("/demo_group_001/accounts");
    await expectHeading(page, "連携サービス一覧");

    await page.getByRole("link", { name: /^SBI証券 自動連携/ }).click();
    await expectLocation(page, "/demo_group_001/accounts/demo_000005");
    await expectHeading(page, "SBI証券");
    await expect(page.getByRole("combobox", { name: "グループを選択" })).toContainText("投資");
  });

  test("renders the financial insight sections", async ({ page }) => {
    await page.goto("/insights");
    await expectHeading(page, "財務インサイト");

    for (const section of [
      "貯蓄健全性",
      "財務健全性スコア",
      "収支バランス",
      "支出パターン",
      "投資パフォーマンス",
      "負債分析",
    ]) {
      await expect(page.getByText(section, { exact: true })).toBeVisible();
    }
    await expect(page.getByText(/分析日:/)).toBeVisible();
  });

  test("updates simulator projections when a preset is selected", async ({ page }) => {
    await page.goto("/simulator");
    await expectHeading(page, "シミュレーター");

    const returnRate = page.getByRole("slider", { name: "想定利回り" });
    await expect(returnRate).toHaveAttribute("aria-valuenow", "5");

    await page.getByRole("combobox", { name: "商品プリセット" }).click();
    await page.getByRole("option", { name: "S&P 500" }).click();

    await expect(returnRate).toHaveAttribute("aria-valuenow", "10");
    await expect(page.getByText("元本合計", { exact: true })).toBeVisible();
    await expect(page.getByText(/^運用益/).first()).toBeVisible();
  });

  test("handles invalid dynamic routes", async ({ page }) => {
    const invalidPaths = [
      "/unknown-group",
      "/accounts/unknown-account",
      "/demo_group_001/accounts/unknown-account",
    ];

    for (const path of invalidPaths) {
      await test.step(`Reject ${path}`, async () => {
        await page.goto(path);
        await expectHeading(page, "ページが見つかりません");
        await expect(page.getByRole("link", { name: "ダッシュボードに戻る" })).toBeVisible();
      });
    }

    for (const path of ["/cf/1900-01", "/demo_group_001/cf/1900-01"]) {
      await test.step(`Render the empty month state for ${path}`, async () => {
        await page.goto(path);
        await expectHeading(page, "収支 - 1900年1月");
        await expect(page.getByText("データがありません").first()).toBeVisible();
      });
    }
  });
});
