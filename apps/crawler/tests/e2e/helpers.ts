import type { Browser, BrowserContext, Page } from "playwright";
import { chromium } from "playwright";
import { createBrowserContext } from "../../src/browser/context.js";

export async function launchLoggedInContext(): Promise<{
  browser: Browser;
  context: BrowserContext;
}> {
  const browser = await chromium.launch({ headless: true });
  const context = await createBrowserContext(browser, { useAuthState: true });
  return { browser, context };
}

export async function withNewPage<T>(
  context: BrowserContext,
  fn: (page: Page) => Promise<T>,
): Promise<T> {
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await page.close();
  }
}
