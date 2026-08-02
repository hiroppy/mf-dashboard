import { expect, type Page, test } from "@playwright/test";

function getCard(page: Page, title: string) {
  return page
    .getByText(title, { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]");
}

test.describe("Financial interactions", () => {
  test("switches the asset comparison period", async ({ page }) => {
    await page.goto("/");

    const card = getCard(page, "資産構成");
    const daily = card.getByRole("button", { name: "前日" });
    const weekly = card.getByRole("button", { name: "週間" });
    const monthly = card.getByRole("button", { name: "月間" });

    await expect(daily).toHaveClass(/bg-primary/);
    const dailyText = await card.textContent();

    await weekly.click();
    await expect(weekly).toHaveClass(/bg-primary/);
    await expect.poll(() => card.textContent()).not.toBe(dailyText);
    const weeklyText = await card.textContent();

    await monthly.click();
    await expect(monthly).toHaveClass(/bg-primary/);
    await expect.poll(() => card.textContent()).not.toBe(weeklyText);
  });

  test("shares the gain filter across asset summaries and holdings", async ({ page }) => {
    await page.goto("/bs");

    const gainCard = getCard(page, "含み損益");
    const holdingsCard = getCard(page, "保有資産");
    const gainFilter = page.getByRole("combobox", { name: "損益を選択" });
    const allHoldingsText = await holdingsCard.textContent();

    await gainFilter.click();
    await page.getByRole("option", { name: "含み損" }).click();

    await expect(gainFilter).toContainText("含み損");
    await expect(gainCard.getByText("含み損上位", { exact: true })).toBeVisible();
    await expect(gainCard.getByText("含み益上位", { exact: true })).toHaveCount(0);
    await expect.poll(() => holdingsCard.textContent()).not.toBe(allHoldingsText);
    const lossHoldingsText = await holdingsCard.textContent();

    await gainFilter.click();
    await page.getByRole("option", { name: "含み益" }).click();

    await expect(gainFilter).toContainText("含み益");
    await expect(gainCard.getByText("含み益上位", { exact: true })).toBeVisible();
    await expect(gainCard.getByText("含み損上位", { exact: true })).toHaveCount(0);
    await expect.poll(() => holdingsCard.textContent()).not.toBe(lossHoldingsText);
  });

  test("opens, sorts, closes, and reopens transaction details", async ({ page }) => {
    await page.goto("/cf");

    const expenseCard = getCard(page, "支出カテゴリ別内訳").first();
    const categoryButton = expenseCard.getByRole("button").first();
    await expect(categoryButton).toBeEnabled();
    await categoryButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("取引件数", { exact: true })).toBeVisible();

    const sort = dialog.getByRole("combobox", { name: "並び順" });
    await expect(sort).toContainText("金額順");
    await sort.click();
    await page.getByRole("option", { name: "日付順" }).click();
    await expect(sort).toContainText("日付順");

    await dialog.getByRole("button", { name: "明細を閉じる" }).click();
    await expect(dialog).toBeHidden();
    await categoryButton.click();
    await expect(page.getByRole("dialog").getByRole("combobox", { name: "並び順" })).toContainText(
      "金額順",
    );
  });
});
