import type { Liabilities, LiabilityItem } from "@moneyforward-daily-action/db/types";
import type { Page } from "playwright";
import { mfUrls } from "@moneyforward-daily-action/meta/urls";
import { debug } from "../logger.js";
import { parseJapaneseNumber } from "../parsers.js";

export async function getLiabilities(page: Page): Promise<Liabilities> {
  debug("Getting liabilities from /bs/liability page...");

  await page.goto(mfUrls.liability, {
    waitUntil: "domcontentloaded",
  });
  // ページ読み込み完了を待機
  await page.waitForLoadState("load");

  const items: LiabilityItem[] = [];
  let totalLiabilities = 0;

  // Find the detail table (table-det class)
  // Structure: 種類 | 名称・説明 | 残高 | 保有金融機関 | 変更 | 削除
  const detailTable = page.locator("table.table-det");
  const detailExists = await detailTable.count();

  if (detailExists > 0) {
    const rows = detailTable.locator("tbody tr");
    const rowCount = await rows.count();

    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const cells = row.locator("td");
      const cellCount = await cells.count();

      if (cellCount >= 4) {
        // 並列取得
        const [category, name, balanceText, institution] = await Promise.all([
          cells
            .nth(0)
            .textContent({ timeout: 1000 })
            .catch(() => ""),
          cells
            .nth(1)
            .textContent({ timeout: 1000 })
            .catch(() => ""),
          cells
            .nth(2)
            .textContent({ timeout: 1000 })
            .catch(() => "0"),
          cells
            .nth(3)
            .textContent({ timeout: 1000 })
            .catch(() => ""),
        ]);

        // Skip header rows
        if (category?.includes("種類") || name?.includes("名称")) {
          continue;
        }

        if (name && name.trim()) {
          const balance = parseJapaneseNumber(balanceText || "0");
          items.push({
            name: name.trim(),
            category: category?.trim() || "その他の負債",
            institution: institution?.trim() || "",
            balance,
          });
          totalLiabilities += balance;
        }
      }
    }
  }

  // If no detail table, try summary table (first table with bordered class)
  if (items.length === 0) {
    const summaryTable = page.locator("table.table-bordered").first();
    const summaryExists = await summaryTable.count();

    if (summaryExists > 0) {
      const rows = summaryTable.locator("tbody tr, tr");
      const rowCount = await rows.count();

      for (let i = 0; i < rowCount; i++) {
        const row = rows.nth(i);
        const cells = row.locator("td");
        const cellCount = await cells.count();

        if (cellCount >= 2) {
          const category = await cells
            .nth(0)
            .textContent({ timeout: 1000 })
            .catch(() => "");
          const balanceText = await cells
            .nth(1)
            .textContent({ timeout: 1000 })
            .catch(() => "0");

          if (
            category &&
            category.trim() &&
            !category.includes("負債") &&
            !category.includes("合計")
          ) {
            const balance = parseJapaneseNumber(balanceText || "0");
            if (balance > 0) {
              items.push({
                name: category.trim(),
                category: category.trim(),
                institution: "",
                balance,
              });
              totalLiabilities += balance;
            }
          }
        }
      }
    }
  }

  debug(`  Found ${items.length} liability items, total: ¥${totalLiabilities.toLocaleString()}`);

  return {
    items,
    totalLiabilities,
  };
}
