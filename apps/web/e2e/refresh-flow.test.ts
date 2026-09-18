import { expect, type APIRequestContext, type Page, test } from "@playwright/test";

const mockCrawlerUrl = "http://127.0.0.1:18766";

async function resetCrawler(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${mockCrawlerUrl}/__test/reset`);
  expect(response.ok()).toBe(true);
}

async function startRefresh(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "金融機関データを更新" }).click();
  await expect(page.getByRole("button", { name: "同期タイムラインを表示" })).toBeVisible();
}

test.describe("Crawler refresh flow", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "The shared mock crawler runs once on desktop");

    await resetCrawler(request);
  });

  test("starts and completes a refresh through the web proxy", async ({ page, request }) => {
    const startButton = page.getByRole("button", { name: "金融機関データを更新" });
    await page.goto("/");
    await expect(startButton).toBeEnabled();
    await startButton.click();

    const timelineButton = page.getByRole("button", { name: "同期タイムラインを表示" });
    await expect(timelineButton).toBeVisible();
    await timelineButton.click();

    const timeline = page.locator('[aria-label="同期タイムライン"]');
    await expect(timeline).toBeVisible();
    await expect(timeline.getByText("MoneyForward に認証")).toBeVisible();
    await expect(timeline.getByText("実行中")).toBeVisible();

    const completeResponse = await request.post(`${mockCrawlerUrl}/__test/complete`);
    expect(completeResponse.ok()).toBe(true);

    await expect(startButton).toBeVisible();
    const stateResponse = await request.get(`${mockCrawlerUrl}/__test/state`);
    expect(await stateResponse.json()).toMatchObject({ runCount: 1 });
  });

  test("returns the running state for a duplicate refresh request", async ({ page, request }) => {
    await startRefresh(page);

    const duplicate = await page.evaluate(async () => {
      const response = await fetch("/api/crawler/refresh/", { method: "POST" });
      return { status: response.status, body: (await response.json()) as unknown };
    });

    expect(duplicate).toMatchObject({ status: 409, body: { running: true } });
    const stateResponse = await request.get(`${mockCrawlerUrl}/__test/state`);
    expect(await stateResponse.json()).toMatchObject({ runCount: 1 });
  });

  test("shows a failed refresh and allows retry", async ({ page, request }) => {
    await startRefresh(page);

    const failResponse = await request.post(`${mockCrawlerUrl}/__test/fail`);
    expect(failResponse.ok()).toBe(true);

    const failedButton = page.getByRole("button", { name: "同期失敗の詳細を表示" });
    await expect(failedButton).toBeVisible();
    await failedButton.click();

    const details = page.locator('[aria-label="同期失敗の詳細"]');
    await expect(details.getByRole("heading", { name: "同期に失敗しました" })).toBeVisible();
    await expect(details.getByText("E2E用の認証エラー")).toBeVisible();
    await details.getByRole("button", { name: "再度更新" }).click();

    await expect(page.getByRole("button", { name: "同期タイムラインを表示" })).toBeVisible();
    await expect
      .poll(async () => {
        const response = await request.get(`${mockCrawlerUrl}/__test/state`);
        const body = (await response.json()) as {
          runCount: number;
          state: { running: boolean };
        };
        return { runCount: body.runCount, running: body.state.running };
      })
      .toEqual({ runCount: 2, running: true });
  });
});
