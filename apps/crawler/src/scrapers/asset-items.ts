import type { AssetItem } from "@mf-dashboard/db/types";
import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Page } from "playwright";
import { debug } from "../logger.js";
import { navigateToPage } from "../navigation.js";
import { calculateChange } from "../parsers.js";

export async function getAssetItems(page: Page): Promise<AssetItem[]> {
  debug("Getting asset items from bs/history page...");

  await navigateToPage(page, mfUrls.assetHistory);
  // テーブルが表示されるまで待機
  await page.locator("table.table-bordered").waitFor({ state: "visible", timeout: 10000 });

  const items: AssetItem[] = [];

  // ヘッダーからカテゴリ名を動的取得
  // Structure: 日付(th) | 合計(th) | カテゴリ1(th) | ... | 詳細(th)
  const headers = await page.locator("table.table-bordered thead th").allTextContents();
  // 最初の「日付」と最後の「詳細」を除外
  const categories = headers.slice(1, -1).map((h) => h.trim());

  const rows = page.locator("table.table-bordered tbody tr");
  const count = await rows.count();

  if (count >= 2) {
    const todayRow = rows.nth(0);
    const yesterdayRow = rows.nth(1);
    const todayCells = todayRow.locator("td");
    const yesterdayCells = yesterdayRow.locator("td");

    // 全カテゴリのセル値を並列取得
    const todayPromises = categories.map((_, i) =>
      todayCells
        .nth(i)
        .textContent({ timeout: 1000 })
        .catch(() => ""),
    );
    const yesterdayPromises = categories.map((_, i) =>
      yesterdayCells
        .nth(i)
        .textContent({ timeout: 1000 })
        .catch(() => ""),
    );

    const [todayValues, yesterdayValues] = await Promise.all([
      Promise.all(todayPromises),
      Promise.all(yesterdayPromises),
    ]);

    for (let i = 0; i < categories.length; i++) {
      const balance = todayValues[i];
      const previousBalance = yesterdayValues[i];

      if (balance) {
        const change = calculateChange(balance, previousBalance || "");
        items.push({
          name: categories[i],
          balance: balance.trim(),
          previousBalance: previousBalance?.trim() || "",
          change,
        });
      }
    }
  }

  return items;
}
