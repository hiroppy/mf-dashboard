import { expect, test, type Page, type Route } from "@playwright/test";

const assistantText = "6月10日の支出は合計3,200円でした。";
const assistantMarkdown = `${assistantText}\n\n[収支詳細を見る](/cf/2026-06)`;

function streamChunk(chunk: object): string {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

async function fulfillChatStream(route: Route) {
  const body = [
    { type: "start", messageId: "assistant-a" },
    { type: "start-step" },
    { type: "text-start", id: "text-a" },
    { type: "text-delta", id: "text-a", delta: assistantMarkdown },
    { type: "text-end", id: "text-a" },
    {
      type: "tool-input-available",
      toolCallId: "navigate-a",
      toolName: "getFinanceDashboardRoute",
      input: { page: "cashFlow", month: "2026-06" },
    },
    {
      type: "tool-output-available",
      toolCallId: "navigate-a",
      output: { href: "/cf/2026-06" },
    },
    { type: "finish-step" },
    { type: "finish", finishReason: "stop" },
  ]
    .map(streamChunk)
    .join("");

  await route.fulfill({
    body,
    headers: {
      "cache-control": "no-cache",
      "content-type": "text/event-stream",
      "x-vercel-ai-ui-message-stream": "v1",
    },
    status: 200,
  });
}

async function openChat(page: Page) {
  await page.getByRole("button", { name: "家計AIチャットを開く" }).click();
  await expect(page.getByRole("complementary", { name: "家計AIチャット" })).toHaveAttribute(
    "aria-hidden",
    "false",
  );
}

async function sendPrompt(page: Page) {
  await page.getByLabel("家計AIへのメッセージ").fill("6月10日の支出を見たい");
  await page.getByRole("button", { name: "メッセージを送信" }).click();

  await expect(page.getByText(assistantText)).toBeVisible();
  await expect(page.getByRole("link", { name: "収支詳細を見る" })).toBeVisible();
}

test.describe("Finance chat", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/chat", fulfillChatStream);
  });

  test("keeps in-memory chat across navigation and clears it on reload", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium");

    await page.goto("/");
    await openChat(page);
    await sendPrompt(page);
    await page.screenshot({ path: testInfo.outputPath("finance-chat-desktop.png") });

    await page.getByRole("link", { name: "収支詳細を見る" }).click();
    await expect(page).toHaveURL(/\/cf\/2026-06\/?$/);
    await expect(page.getByText(assistantText)).toBeVisible();

    await page.reload();
    await openChat(page);
    await expect(page.getByText(assistantText)).toHaveCount(0);
    await expect(page.getByText("6月10日の支出を見たい")).toHaveCount(0);
  });

  test("uses a bottom sheet and renders the response on mobile", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome");

    await page.goto("/");
    await openChat(page);

    const panel = page.getByRole("complementary", { name: "家計AIチャット" });
    const panelBox = await panel.boundingBox();
    const viewport = page.viewportSize();

    if (!panelBox || !viewport) {
      throw new Error("The mobile chat panel must have a visible bounding box");
    }

    expect(panelBox.width).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(panelBox.y + panelBox.height).toBeGreaterThanOrEqual(viewport.height - 1);

    await sendPrompt(page);
    await page.screenshot({ path: testInfo.outputPath("finance-chat-mobile.png") });
  });
});
