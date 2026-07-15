import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { navigateToAccountsPage } from "./refresh.js";

describe("refresh - 更新中セレクタ", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  test("更新中のアカウントを正しくカウントする", async () => {
    const html = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <table id="account-table">
    <thead>
      <tr>
        <th>金融機関</th>
        <th>残高</th>
        <th>前回取得日</th>
        <th>状態</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>SBI銀行</td>
        <td>¥1,000,000</td>
        <td>2026/01/29</td>
        <td>更新中</td>
      </tr>
      <tr>
        <td>三井住友銀行</td>
        <td>¥500,000</td>
        <td>2026/01/29</td>
        <td>正常</td>
      </tr>
      <tr>
        <td>SBI証券</td>
        <td>¥2,000,000</td>
        <td>2026/01/29</td>
        <td>更新中</td>
      </tr>
    </tbody>
  </table>
</body>
</html>
    `;

    await page.setContent(html);

    const statusCells = page.locator("#account-table td:nth-child(4)");
    const cellCount = await statusCells.count();
    let updatingCount = 0;

    for (let i = 0; i < cellCount; i++) {
      const text = await statusCells.nth(i).textContent();
      if (text?.trim() === "更新中") {
        updatingCount++;
      }
    }

    expect(updatingCount).toBe(2);
  });

  test("更新中のアカウントがない場合は0を返す", async () => {
    const html = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <table id="account-table">
    <thead>
      <tr>
        <th>金融機関</th>
        <th>残高</th>
        <th>前回取得日</th>
        <th>状態</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>SBI銀行</td>
        <td>¥1,000,000</td>
        <td>2026/01/29</td>
        <td>正常</td>
      </tr>
      <tr>
        <td>三井住友銀行</td>
        <td>¥500,000</td>
        <td>2026/01/29</td>
        <td>正常</td>
      </tr>
    </tbody>
  </table>
</body>
</html>
    `;

    await page.setContent(html);

    const statusCells = page.locator("#account-table td:nth-child(4)");
    const cellCount = await statusCells.count();
    let updatingCount = 0;

    for (let i = 0; i < cellCount; i++) {
      const text = await statusCells.nth(i).textContent();
      if (text?.trim() === "更新中") {
        updatingCount++;
      }
    }

    expect(updatingCount).toBe(0);
  });

  test("すべてのアカウントが更新中の場合", async () => {
    const html = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <table id="account-table">
    <thead>
      <tr>
        <th>金融機関</th>
        <th>残高</th>
        <th>前回取得日</th>
        <th>状態</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>SBI銀行</td>
        <td>¥1,000,000</td>
        <td>2026/01/29</td>
        <td>更新中</td>
      </tr>
      <tr>
        <td>三井住友銀行</td>
        <td>¥500,000</td>
        <td>2026/01/29</td>
        <td>更新中</td>
      </tr>
      <tr>
        <td>SBI証券</td>
        <td>¥2,000,000</td>
        <td>2026/01/29</td>
        <td>更新中</td>
      </tr>
    </tbody>
  </table>
</body>
</html>
    `;

    await page.setContent(html);

    const statusCells = page.locator("#account-table td:nth-child(4)");
    const cellCount = await statusCells.count();
    let updatingCount = 0;

    for (let i = 0; i < cellCount; i++) {
      const text = await statusCells.nth(i).textContent();
      if (text?.trim() === "更新中") {
        updatingCount++;
      }
    }

    expect(updatingCount).toBe(3);
  });

  test("他のカラムに更新中という文字があっても状態カラムのみをカウントする", async () => {
    const html = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <table id="account-table">
    <thead>
      <tr>
        <th>金融機関</th>
        <th>残高</th>
        <th>前回取得日</th>
        <th>状態</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>更新中銀行</td>
        <td>¥1,000,000</td>
        <td>2026/01/29</td>
        <td>正常</td>
      </tr>
      <tr>
        <td>三井住友銀行</td>
        <td>¥500,000</td>
        <td>更新中</td>
        <td>正常</td>
      </tr>
    </tbody>
  </table>
</body>
</html>
    `;

    await page.setContent(html);

    const statusCells = page.locator("#account-table td:nth-child(4)");
    const cellCount = await statusCells.count();
    let updatingCount = 0;

    for (let i = 0; i < cellCount; i++) {
      const text = await statusCells.nth(i).textContent();
      if (text?.trim() === "更新中") {
        updatingCount++;
      }
    }

    // 状態カラム（4番目）には「更新中」がないので0
    expect(updatingCount).toBe(0);
  });

  test("空のテーブルの場合は0を返す", async () => {
    const html = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <table id="account-table">
    <thead>
      <tr>
        <th>金融機関</th>
        <th>残高</th>
        <th>前回取得日</th>
        <th>状態</th>
      </tr>
    </thead>
    <tbody>
    </tbody>
  </table>
</body>
</html>
    `;

    await page.setContent(html);

    const statusCells = page.locator("#account-table td:nth-child(4)");
    const cellCount = await statusCells.count();
    let updatingCount = 0;

    for (let i = 0; i < cellCount; i++) {
      const text = await statusCells.nth(i).textContent();
      if (text?.trim() === "更新中") {
        updatingCount++;
      }
    }

    expect(updatingCount).toBe(0);
  });

  test("一時停止中のアカウントは更新中としてカウントしない", async () => {
    const html = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <table id="account-table">
    <thead>
      <tr>
        <th>金融機関</th>
        <th>残高</th>
        <th>前回取得日</th>
        <th>状態</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>SBI銀行</td>
        <td>¥1,000,000</td>
        <td>2026/01/29</td>
        <td>更新中</td>
      </tr>
      <tr>
        <td>エポスカード</td>
        <td>¥500,000</td>
        <td>2026/01/29</td>
        <td>更新中 → 一時停止中</td>
      </tr>
      <tr>
        <td>三井住友銀行</td>
        <td>¥2,000,000</td>
        <td>2026/01/29</td>
        <td>正常</td>
      </tr>
    </tbody>
  </table>
</body>
</html>
    `;

    await page.setContent(html);

    // 実際のコードと同じロジックでカウント
    const statusCells = page.locator("#account-table td:nth-child(4)");
    const cellCount = await statusCells.count();
    let updatingCount = 0;

    for (let i = 0; i < cellCount; i++) {
      const text = await statusCells.nth(i).textContent();
      if (text?.trim() === "更新中") {
        updatingCount++;
      }
    }

    expect(updatingCount).toBe(1);
  });

  test("accountsページへの遷移がERR_ABORTEDでも1回だけ再試行する", async () => {
    const goto = vi.fn<(...args: any[]) => any>().mockImplementationOnce(() => {
      throw new Error("page.goto: net::ERR_ABORTED at https://moneyforward.com/accounts");
    });
    const waitForLoadState = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined);
    const waitForTimeout = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined);
    const isClosed = vi.fn<(...args: any[]) => any>().mockReturnValue(false);

    const retryPage = {
      goto,
      waitForLoadState,
      waitForTimeout,
      isClosed,
    } as unknown as Page;

    await navigateToAccountsPage(retryPage);

    expect(goto).toHaveBeenCalledTimes(2);
    expect(waitForTimeout).toHaveBeenCalledWith(1000);
    expect(waitForLoadState).toHaveBeenCalledTimes(1);
  });
});
