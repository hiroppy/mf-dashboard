import { getJstYearMonthKey } from "@mf-dashboard/date-utils";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { getCashFlow, parseCashFlowMonthHeader } from "./cash-flow.js";

describe("parseCashFlowMonthHeader", () => {
  test.each([
    ["2026年8月", "2026-08"],
    [" 2025年12月 ", "2025-12"],
    ["2026/8/1 - 2026/8/31", "2026-08"],
  ])("%j から対象月を取得する", (header, expected) => {
    expect(parseCashFlowMonthHeader(header)).toBe(expected);
  });

  test.each([null, "", "2026-08", "2026年0月", "2026年13月", "2026/13/1 - 2026/13/31"])(
    "%j は対象月として扱わない",
    (header) => {
      expect(parseCashFlowMonthHeader(header)).toBeNull();
    },
  );
});

describe("getCashFlow", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  test("当月取得レスポンスと月表示の更新を待ってから結果を返す", async () => {
    const page = await browser.newPage();
    const currentMonth = getJstYearMonthKey();
    const [year, month] = currentMonth.split("-");
    let fetchRequestCount = 0;

    try {
      await page.route("https://moneyforward.com/**", async (route) => {
        if (new URL(route.request().url()).pathname === "/cf/fetch") {
          fetchRequestCount++;
          await route.fulfill({ contentType: "application/json", body: "{}" });
          return;
        }

        await route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: `
            <button class="fc-button-today">今日</button>
            <a href="/cf/csv?year=2000&month=1">CSV</a>
            <table id="monthly_total_table_kakeibo"><tbody><tr>
              <td>0</td><td></td><td>0</td><td></td><td>0</td>
            </tr></tbody></table>
            <table id="cf-detail-table" style="display: table; width: 1px; height: 1px">
              <tbody></tbody>
            </table>
            <script>
              document.querySelector(".fc-button-today").addEventListener("click", async () => {
                await fetch("/cf/fetch?today=1");
                setTimeout(() => {
                  document.querySelector("a[href*='/cf/csv']").href = "/cf/csv?year=${year}&month=${Number(month)}";
                }, 25);
              });
            </script>
          `,
        });
      });

      await expect(getCashFlow(page)).resolves.toMatchObject({ month: currentMonth, items: [] });
      expect(fetchRequestCount).toBe(1);
    } finally {
      await page.close();
    }
  });
});
