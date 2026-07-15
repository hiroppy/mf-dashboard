import type { AssetHistory, AssetHistoryPoint } from "@mf-dashboard/db/types";
import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Page } from "playwright";
import { debug } from "../logger.js";
import { parseJapaneseNumber } from "../parsers.js";

export async function getAssetHistory(page: Page): Promise<AssetHistory> {
  debug("Getting asset history from /bs/history page...");

  await page.goto(mfUrls.assetHistory, {
    waitUntil: "domcontentloaded",
  });
  // テーブルが表示されるまで待機
  await page.locator("table.table-bordered").waitFor({ state: "visible", timeout: 10000 });

  const points: AssetHistoryPoint[] = [];

  // ヘッダーからカテゴリ名を動的取得
  const headers = await page.locator("table.table-bordered thead th").allTextContents();
  // headers: ["日付", "合計", "預金・現金", "暗号資産", "株式(現物)", ..., "詳細"]
  const categoryNames = headers.slice(2, -1).map((h) => h.trim()); // 日付と合計と詳細を除外

  const rows = page.locator("table.table-bordered tbody tr");
  const count = await rows.count();

  interface RawPoint {
    date: string;
    totalAssets: number;
    categories: Record<string, number>;
  }
  const rawPoints: RawPoint[] = [];

  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const tds = row.locator("td");

    // カテゴリ値を並列取得
    const categoryPromises = categoryNames.map((_, j) =>
      tds
        .nth(j + 1) // td[0] は合計なので +1
        .textContent({ timeout: 1000 })
        .catch(() => "0"),
    );

    // 日付、合計、全カテゴリを並列取得
    const [dateText, totalAssetsText, ...categoryTexts] = await Promise.all([
      row
        .locator("th")
        .first()
        .textContent({ timeout: 1000 })
        .catch(() => ""),
      tds
        .nth(0)
        .textContent({ timeout: 1000 })
        .catch(() => "0"),
      ...categoryPromises,
    ]);

    // カテゴリオブジェクトを構築
    const categories: Record<string, number> = {};
    for (let j = 0; j < categoryNames.length; j++) {
      categories[categoryNames[j]] = parseJapaneseNumber(categoryTexts[j] || "0");
    }

    if (dateText) {
      rawPoints.push({
        date: dateText.trim(),
        totalAssets: parseJapaneseNumber(totalAssetsText || "0"),
        categories,
      });
    }
  }

  // Calculate changes
  for (let i = 0; i < rawPoints.length; i++) {
    const current = rawPoints[i];
    const previous = rawPoints[i + 1];
    const change = previous ? current.totalAssets - previous.totalAssets : 0;

    points.push({
      date: current.date,
      totalAssets: current.totalAssets,
      change,
      categories: current.categories,
    });
  }

  return { points };
}
