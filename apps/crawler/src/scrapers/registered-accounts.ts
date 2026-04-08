import type { RegisteredAccounts, AccountStatus } from "@mf-dashboard/db/types";
import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Page } from "playwright";
import { debug } from "../logger.js";
import { parseJapaneseNumber } from "../parsers.js";

export async function getRegisteredAccounts(page: Page): Promise<RegisteredAccounts> {
  debug("Getting registered accounts from /accounts page...");

  await page.goto(mfUrls.accounts, {
    waitUntil: "domcontentloaded",
  });
  // テーブルが表示されるまで待機
  await page.locator("#account-table").first().waitFor({ state: "visible", timeout: 10000 });

  const accounts: AccountStatus[] = [];

  // Get all #account-table tables (first is manual, second is auto-linked)
  const tables = page.locator("#account-table");
  const tableCount = await tables.count();

  for (let t = 0; t < tableCount; t++) {
    const table = tables.nth(t);
    const rows = table.locator("tbody tr");
    const rowCount = await rows.count();

    // Skip header row (first row contains headers)
    for (let i = 1; i < rowCount; i++) {
      const row = rows.nth(i);
      const cells = row.locator("td");
      const cellCount = await cells.count();

      if (cellCount >= 3) {
        // For auto-linked accounts: 金融機関 | 資産 | 登録日（最終取得日） | 更新状態 | ...
        const nameCell = await cells
          .nth(0)
          .textContent({ timeout: 1000 })
          .catch(() => "");
        const assetsText = await cells
          .nth(1)
          .textContent({ timeout: 1000 })
          .catch(() => "0");
        const dateText = await cells
          .nth(2)
          .textContent({ timeout: 1000 })
          .catch(() => "");
        const statusText =
          cellCount >= 4
            ? await cells
                .nth(3)
                .textContent({ timeout: 1000 })
                .catch(() => "")
            : "";

        // Try account name link first (e.g., /accounts/show/xxx)
        // Fall back to edit link or form action (e.g., /accounts/edit/xxx for 携帯 accounts)
        const url =
          (await cells
            .nth(0)
            .locator("a[href*='/accounts/show']")
            .first()
            .getAttribute("href", { timeout: 1000 })
            .catch(() => "")) ||
          (await row
            .locator("a[href*='/accounts/edit/']")
            .first()
            .getAttribute("href", { timeout: 1000 })
            .catch(() => "")) ||
          (await row
            .locator("form[action*='/accounts/edit/']")
            .first()
            .getAttribute("action", { timeout: 1000 })
            .catch(() => ""));

        if (nameCell) {
          // Parse name - first line before any parentheses or newlines
          let name = nameCell.trim();
          // Get first line
          const firstLine = name.split(/[\n\r]/)[0].trim();
          // Skip if it's a header row
          if (firstLine === "登録名" || firstLine === "金融機関") {
            continue;
          }
          name = firstLine;

          let status: AccountStatus["status"] = "ok";
          let errorMessage: string | undefined = undefined;

          if (statusText?.includes("正常")) {
            status = "ok";
          } else if (statusText?.includes("更新中")) {
            status = "updating";
            errorMessage = statusText.trim();
          } else if (statusText?.includes("取得を停止しています")) {
            status = "suspended";
          } else if (statusText && statusText.trim()) {
            // 正常でも更新中でも停止中でもない場合はエラー扱い
            status = "error";
            errorMessage = statusText.trim();
          }

          // Parse last updated from dateText (format: 登録日\n(最終取得日))
          const lastUpdatedMatch = dateText?.match(/\(([^)]+)\)/);
          const lastUpdated = lastUpdatedMatch ? lastUpdatedMatch[1] : dateText?.trim() || "";

          // Extract mfId from URL (e.g., "/accounts/show/xxx", "/accounts/show_manual/xxx", "/accounts/edit/xxx")
          const mfIdMatch = url?.match(/\/accounts\/(?:show(?:_manual)?|edit)\/([^/?]+)/);
          const mfId = mfIdMatch ? mfIdMatch[1] : `manual-${name}`;

          accounts.push({
            mfId,
            name,
            type: t === 0 ? "手動" : "自動連携",
            status,
            lastUpdated,
            url: url || "",
            totalAssets: parseJapaneseNumber(assetsText || "0"),
            errorMessage,
          });
        }
      }
    }
  }

  return { accounts };
}
