import { test, expect, type Page } from "@playwright/test";

const toggle = (page: Page) => page.getByRole("button", { name: /^テーマ:/ });

async function openDashboard(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ダッシュボード", level: 1 })).toBeVisible();
}

// Below lg the toggle lives in the sidebar drawer, which has to be opened first.
async function revealToggle(page: Page) {
  const menu = page.getByRole("button", { name: "メニューを開く" });
  if (await menu.isVisible()) await menu.click();
  await expect(toggle(page)).toBeVisible();
}

test.describe("Theme toggle", () => {
  test.describe("OS がライトのとき", () => {
    test.use({ colorScheme: "light" });

    test("System → Light → Dark と切り替わり、リロード後も保持される", async ({ page }) => {
      await openDashboard(page);
      await revealToggle(page);
      await expect(page.locator("html")).not.toHaveClass(/dark/);
      await expect(toggle(page)).toHaveAccessibleName(/システム設定/);

      await toggle(page).click();
      await expect(toggle(page)).toHaveAccessibleName(/ライト/);
      await expect(page.locator("html")).not.toHaveClass(/dark/);

      await toggle(page).click();
      await expect(toggle(page)).toHaveAccessibleName(/ダーク/);
      await expect(page.locator("html")).toHaveClass(/dark/);

      await page.reload();
      await expect(page.locator("html")).toHaveClass(/dark/);
      await revealToggle(page);
      await expect(toggle(page)).toHaveAccessibleName(/ダーク/);
    });
  });

  test.describe("OS がダークのとき", () => {
    test.use({ colorScheme: "dark" });

    test("System ではダーク、Light を選ぶとライトになりリロード後も保持される", async ({
      page,
    }) => {
      await openDashboard(page);
      await revealToggle(page);
      await expect(page.locator("html")).toHaveClass(/dark/);

      await toggle(page).click();
      await expect(toggle(page)).toHaveAccessibleName(/ライト/);
      await expect(page.locator("html")).not.toHaveClass(/dark/);

      await page.reload();
      await expect(page.locator("html")).not.toHaveClass(/dark/);
    });

    test("System のまま OS の設定が変わると追従する", async ({ page }) => {
      await openDashboard(page);
      await revealToggle(page);
      await expect(page.locator("html")).toHaveClass(/dark/);

      await page.emulateMedia({ colorScheme: "light" });
      await expect(page.locator("html")).not.toHaveClass(/dark/);
    });
  });
});
