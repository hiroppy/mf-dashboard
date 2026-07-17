import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { parseCategoryCandidates } from "./category-candidates.js";

describe("parseCategoryCandidates", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  test("カテゴリ設定から標準・カスタム中カテゴリと親大カテゴリを抽出する", async () => {
    await page.setContent(`
      <table id="category-settings">
        <tr><td><ul class="nav">
          <li class="dropdown-submenu">
            <a id="1" class="dropdown-toggle">収入</a>
            <ul class="sub_menu">
              <li id="js-middle-category-li-101" class="unsortable">
                <span class="middle_category_default">給与</span>
              </li>
            </ul>
          </li>
          <li class="dropdown-submenu">
            <a id="11" class="dropdown-toggle">食費</a>
            <ul class="sub_menu">
              <li id="js-middle-category-li-41" class="unsortable">
                <span class="middle_category_default">食料品</span>
              </li>
              <li id="js-middle-category-li-2001" class="js-user-middle-category">
                <span class="middle_category_user">カスタム項目</span>
              </li>
            </ul>
          </li>
        </ul></td></tr>
      </table>
    `);

    const result = await page.evaluate(parseCategoryCandidates);

    expect(result).toEqual([
      {
        largeCategoryId: "1",
        largeCategoryName: "収入",
        middleCategoryId: "101",
        middleCategoryName: "給与",
        isIncome: true,
      },
      {
        largeCategoryId: "11",
        largeCategoryName: "食費",
        middleCategoryId: "41",
        middleCategoryName: "食料品",
        isIncome: false,
      },
      {
        largeCategoryId: "11",
        largeCategoryName: "食費",
        middleCategoryId: "2001",
        middleCategoryName: "カスタム項目",
        isIncome: false,
      },
    ]);
  });

  test("カテゴリIDか名称がない項目を除外し、IDペアを重複させない", async () => {
    await page.setContent(`
      <table id="category-settings">
        <tr><td><ul class="nav">
          <li class="dropdown-submenu">
            <a id="11" class="dropdown-toggle">食費</a>
            <ul class="sub_menu">
              <li id="js-middle-category-li-41">
                <span class="middle_category_default">食料品</span>
              </li>
              <li id="js-middle-category-li-41">
                <span class="middle_category_default">食料品</span>
              </li>
              <li id="js-middle-category-li-"><span class="middle_category_default">不正</span></li>
              <li id="js-middle-category-li-42"><span class="middle_category_default"></span></li>
            </ul>
          </li>
        </ul></td></tr>
      </table>
    `);

    const result = await page.evaluate(parseCategoryCandidates);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ largeCategoryId: "11", middleCategoryId: "41" });
  });
});
