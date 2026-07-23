import { mfUrls } from "@mf-dashboard/meta/urls";
import { chromium, type Browser, type Page } from "playwright";
import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import {
  parseInstitutionCategories,
  scrapeInstitutionCategories,
} from "./institution-categories.js";

describe("scrapeInstitutionCategories", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  test("必要な口座一覧のDOMを待ってからカテゴリーを抽出する", async () => {
    const waitFor = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const first = vi.fn<() => { waitFor: typeof waitFor }>().mockReturnValue({ waitFor });
    const locator = vi
      .fn<(selector: string) => { first: typeof first }>()
      .mockReturnValue({ first });
    const goto = vi.fn<() => Promise<null>>().mockResolvedValue(null);
    const evaluate = vi
      .fn<() => Promise<Array<{ mfId: string; category: string }>>>()
      .mockResolvedValue([{ mfId: "account-a", category: "銀行" }]);
    const mockPage = { evaluate, goto, locator } as unknown as Page;

    const result = await scrapeInstitutionCategories(mockPage);

    expect(goto).toHaveBeenCalledWith(mfUrls.home, { waitUntil: "domcontentloaded" });
    expect(locator).toHaveBeenCalledWith(".facilities.accounts-list");
    expect(first).toHaveBeenCalledOnce();
    expect(waitFor).toHaveBeenCalledWith({ state: "attached" });
    expect(evaluate).toHaveBeenCalledWith(parseInstitutionCategories);
    expect(result).toEqual(new Map([["account-a", "銀行"]]));
  });

  test("金融機関カテゴリーを正しく抽出できる", async () => {
    const html = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <section class="accounts">
    <ul class="facilities accounts-list">
      <li class="heading-category-name heading-normal">銀行</li>
      <li class="account facilities-column border-bottom-dotted">
        <div class="heading-accounts">
          <a href="/accounts/show/abc123">SBI銀行</a>
        </div>
      </li>
      <li class="account facilities-column border-bottom-dotted">
        <div class="heading-accounts">
          <a href="/accounts/show/def456">三井住友銀行</a>
        </div>
      </li>
      <li class="heading-category-name heading-normal">証券</li>
      <li class="account facilities-column border-bottom-dotted">
        <div class="heading-accounts">
          <a href="/accounts/show/ghi789">SBI証券</a>
        </div>
      </li>
      <li class="heading-category-name heading-normal">カード</li>
      <li class="account facilities-column border-bottom-dotted">
        <div class="heading-accounts">
          <a href="/accounts/show/jkl012">エポスカード</a>
        </div>
      </li>
      <li class="heading-category-name heading-normal">ポイント</li>
      <li class="account facilities-column border-bottom-dotted">
        <div class="heading-accounts">
          <a href="/accounts/show/mno345">ANAマイレージ</a>
        </div>
      </li>
    </ul>
  </section>
</body>
</html>
    `;

    await page.setContent(html);

    const categoryData = await page.evaluate(parseInstitutionCategories);

    expect(categoryData).toHaveLength(5);

    const categoryMap = new Map(categoryData.map((item) => [item.mfId, item.category]));

    expect(categoryMap.get("abc123")).toBe("銀行");
    expect(categoryMap.get("def456")).toBe("銀行");
    expect(categoryMap.get("ghi789")).toBe("証券");
    expect(categoryMap.get("jkl012")).toBe("カード");
    expect(categoryMap.get("mno345")).toBe("ポイント");
  });

  test("手動アカウント（show_manual）も正しく抽出できる", async () => {
    const html = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <section class="accounts">
    <ul class="facilities accounts-list">
      <li class="heading-category-name heading-normal">その他保有資産</li>
      <li class="account facilities-column border-bottom-dotted">
        <div class="heading-accounts">
          <a href="/accounts/show_manual/manual123">手動登録資産</a>
        </div>
      </li>
      <li class="account facilities-column border-bottom-dotted">
        <div class="heading-accounts">
          <a href="/accounts/show_manual/manual456">PayPal</a>
        </div>
      </li>
    </ul>
  </section>
</body>
</html>
    `;

    await page.setContent(html);

    const categoryData = await page.evaluate(parseInstitutionCategories);

    expect(categoryData).toHaveLength(2);

    const categoryMap = new Map(categoryData.map((item) => [item.mfId, item.category]));

    expect(categoryMap.get("manual123")).toBe("その他保有資産");
    expect(categoryMap.get("manual456")).toBe("その他保有資産");
  });

  test("複数のaccounts-listから全カテゴリーを抽出できる", async () => {
    // Actual MF page has separate sections for manual and auto-linked accounts
    const html = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <section class="accounts">
    <ul class="facilities accounts-list">
      <li class="heading-category-name heading-normal">その他保有資産</li>
      <li class="account facilities-column border-bottom-dotted">
        <p class="heading-accounts">
          <a href="/accounts/show_manual/manual1">手動登録資産</a>
        </p>
      </li>
    </ul>
  </section>
  <section class="accounts">
    <ul class="facilities accounts-list">
      <li class="heading-category-name heading-normal">銀行</li>
      <li class="account facilities-column border-bottom-dotted">
        <div class="heading-accounts">
          <a href="/accounts/show/bank1">SBI銀行</a>
        </div>
      </li>
      <li class="heading-category-name heading-normal">証券</li>
      <li class="account facilities-column border-bottom-dotted">
        <div class="heading-accounts">
          <a href="/accounts/show/sec1">SBI証券</a>
        </div>
      </li>
      <li class="heading-category-name heading-normal">カード</li>
      <li class="account facilities-column border-bottom-dotted">
        <div class="heading-accounts">
          <a href="/accounts/show/card1">エポスカード</a>
        </div>
      </li>
      <li class="heading-category-name heading-normal">携帯</li>
      <li class="account facilities-column border-bottom-dotted">
        <div class="heading-accounts">IIJmio</div>
        <ul><li class="edit-links"><a href="/accounts/edit/mobile1">編集</a></li></ul>
      </li>
      <li class="account facilities-column border-bottom-dotted">
        <div class="heading-accounts">Docomo</div>
        <ul><li class="edit-links-not-display-none"><a href="/accounts/edit/mobile2">編集</a></li></ul>
      </li>
    </ul>
  </section>
</body>
</html>
    `;

    await page.setContent(html);

    const categoryData = await page.evaluate(parseInstitutionCategories);

    expect(categoryData).toHaveLength(6);

    const categoryMap = new Map(categoryData.map((item) => [item.mfId, item.category]));

    expect(categoryMap.get("manual1")).toBe("その他保有資産");
    expect(categoryMap.get("bank1")).toBe("銀行");
    expect(categoryMap.get("sec1")).toBe("証券");
    expect(categoryMap.get("card1")).toBe("カード");
    expect(categoryMap.get("mobile1")).toBe("携帯");
    expect(categoryMap.get("mobile2")).toBe("携帯");
  });

  test("カテゴリーなしのアカウントは無視される", async () => {
    const html = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <section class="accounts">
    <ul class="facilities accounts-list">
      <li class="account facilities-column border-bottom-dotted">
        <div class="heading-accounts">
          <a href="/accounts/show/orphan123">カテゴリーなしアカウント</a>
        </div>
      </li>
      <li class="heading-category-name heading-normal">銀行</li>
      <li class="account facilities-column border-bottom-dotted">
        <div class="heading-accounts">
          <a href="/accounts/show/valid123">正常なアカウント</a>
        </div>
      </li>
    </ul>
  </section>
</body>
</html>
    `;

    await page.setContent(html);

    const categoryData = await page.evaluate(parseInstitutionCategories);

    // カテゴリーなしのアカウントは無視され、1件のみ取得される
    expect(categoryData).toHaveLength(1);
    expect(categoryData[0].mfId).toBe("valid123");
    expect(categoryData[0].category).toBe("銀行");
  });

  test("空のリストは空の配列を返す", async () => {
    const html = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <section class="accounts">
    <ul class="facilities accounts-list">
    </ul>
  </section>
</body>
</html>
    `;

    await page.setContent(html);

    const categoryData = await page.evaluate(parseInstitutionCategories);

    expect(categoryData).toHaveLength(0);
  });
});
