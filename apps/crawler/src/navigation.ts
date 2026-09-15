import type { Page, Response } from "playwright";

const DEFAULT_NAVIGATION_TIMEOUT_MS = 60000;
const DEFAULT_RETRY_DELAY_MS = 1000;

interface NavigationOptions {
  retryDelayMs?: number;
  timeoutMs?: number;
}

function isRetryableNavigationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("net::ERR_ABORTED") || message.includes("Timeout");
}

function isCurrentUrl(page: Page, targetUrl: string): boolean {
  try {
    return new URL(page.url()).href === new URL(targetUrl).href;
  } catch {
    return false;
  }
}

export async function navigateToPage(
  page: Page,
  url: string,
  options: NavigationOptions = {},
): Promise<Response | null> {
  if (isCurrentUrl(page, url)) {
    return null;
  }

  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const timeout = options.timeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await page.goto(url, { waitUntil: "domcontentloaded", timeout });
    } catch (error) {
      if (page.isClosed() || !isRetryableNavigationError(error) || attempt === 1) {
        throw error;
      }

      // ERR_ABORTED can be reported after the target page has already won a
      // redirect/navigation race. Avoid starting another navigation in that case.
      if (isCurrentUrl(page, url)) {
        return null;
      }

      // A crashed page can reject page.waitForTimeout() and hide the original error.
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  return null;
}
