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

  test("大項目selectとdata-large-category-id付き中項目optionから候補を抽出する", async () => {
    await page.setContent(`
      <select name="user_asset_act[large_category_id]">
        <option value="11">食費</option>
        <option value="13">趣味・娯楽</option>
      </select>
      <select name="user_asset_act[middle_category_id]">
        <option value="41" data-large-category-id="11">食料品</option>
        <option value="77" data-large-category-id="13">動画・音楽</option>
      </select>
    `);

    const result = await page.evaluate(parseCategoryCandidates);

    expect(result).toEqual([
      {
        largeCategoryId: "11",
        largeCategoryName: "食費",
        middleCategoryId: "41",
        middleCategoryName: "食料品",
        isIncome: false,
      },
      {
        largeCategoryId: "13",
        largeCategoryName: "趣味・娯楽",
        middleCategoryId: "77",
        middleCategoryName: "動画・音楽",
        isIncome: false,
      },
    ]);
  });

  test("取引行内のhidden inputと表示テキストから候補を補完する", async () => {
    await page.setContent(`
      <table id="cf-detail-table">
        <tbody>
          <tr id="js-transaction-tx-1">
            <td></td>
            <td>06/01</td>
            <td>スーパーA</td>
            <td>-1,200</td>
            <td>カードA</td>
            <td>
              食費
              <input name="user_asset_act[large_category_id]" value="11" />
            </td>
            <td>
              食料品
              <input name="user_asset_act[middle_category_id]" value="41" />
            </td>
          </tr>
        </tbody>
      </table>
    `);

    const result = await page.evaluate(parseCategoryCandidates);

    expect(result).toEqual([
      {
        largeCategoryId: "11",
        largeCategoryName: "食費",
        middleCategoryId: "41",
        middleCategoryName: "食料品",
        isIncome: false,
      },
    ]);
  });

  test("取引行内selectではセル全体ではなく選択中optionの表示名を使う", async () => {
    await page.setContent(`
      <table id="cf-detail-table">
        <tbody>
          <tr id="js-transaction-tx-1">
            <td></td>
            <td>06/01</td>
            <td>Service A</td>
            <td>-1,200</td>
            <td>Card A</td>
            <td>
              <select name="user_asset_act[large_category_id]">
                <option value="11">食費</option>
                <option value="13" selected>趣味・娯楽</option>
              </select>
            </td>
            <td>
              <select name="user_asset_act[middle_category_id]">
                <option value="41">食料品</option>
                <option value="77" selected>動画・音楽</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
    `);

    const result = await page.evaluate(parseCategoryCandidates);

    expect(result).toEqual([
      {
        largeCategoryId: "13",
        largeCategoryName: "趣味・娯楽",
        middleCategoryId: "77",
        middleCategoryName: "動画・音楽",
        isIncome: false,
      },
    ]);
  });
});
