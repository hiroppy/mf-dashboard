import type { RefreshResult } from "@mf-dashboard/db/types";
import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Page } from "playwright";
import { debug, info, warn } from "../logger.js";

const DEFAULT_MAX_WAIT_MINUTES = 20;
const POLL_INTERVAL_MS = 30000; // 30 seconds
const NAVIGATION_RETRY_DELAY_MS = 1000;
const NAVIGATION_TIMEOUT_MS = 60000;

interface NavigationOptions {
  retryDelayMs?: number;
}

function isRetryableNavigationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("net::ERR_ABORTED") || message.includes("Timeout");
}

export async function navigateToAccountsPage(
  page: Page,
  options: NavigationOptions = {},
): Promise<void> {
  const MAX_RETRIES = 1;
  const retryDelayMs = options.retryDelayMs ?? NAVIGATION_RETRY_DELAY_MS;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await page.goto(mfUrls.accounts, {
        waitUntil: "domcontentloaded",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      return;
    } catch (err) {
      if (page.isClosed()) {
        throw err;
      }

      if (!isRetryableNavigationError(err) || attempt === MAX_RETRIES) {
        throw err;
      }

      // A crashed Playwright page can reject page.waitForTimeout() and mask the
      // original navigation error. Use a process timer between attempts instead.
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}

export async function getRefreshStatus(
  page: Page,
): Promise<{ incompleteAccounts: string[]; remainingCount: number }> {
  const rows = page.locator("#account-table tr:has(td.account-status)");
  const count = await rows.count();
  const refreshRows: RefreshStatusRow[] = [];

  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const statuses = await row.locator("td.account-status").allTextContents();
    const nameLink = row.locator("td.service a").first();
    refreshRows.push({
      name: statuses.some((status) => status.trim() === "更新中")
        ? await ((await nameLink.count()) > 0 ? nameLink : row.locator("td").first()).textContent()
        : null,
      statuses,
    });
  }

  return summarizeRefreshRows(refreshRows);
}

export interface RefreshStatusRow {
  name: string | null;
  statuses: string[];
}

export function summarizeRefreshRows(rows: readonly RefreshStatusRow[]): {
  incompleteAccounts: string[];
  remainingCount: number;
} {
  const incompleteAccounts: string[] = [];
  let remainingCount = 0;

  for (const row of rows) {
    if (!row.statuses.some((status) => status.trim() === "更新中")) {
      continue;
    }

    remainingCount++;
    const accountName = row.name?.trim();
    if (accountName) {
      incompleteAccounts.push(accountName);
    }
  }

  return { incompleteAccounts, remainingCount };
}

async function dismissBlockingModal(page: Page): Promise<boolean> {
  const iframeSelector = 'iframe[title="Modal Message"]';
  const iframe = page.locator(iframeSelector).first();
  if (!(await iframe.count())) {
    return false;
  }

  const modalFrame = page.frameLocator(iframeSelector);
  const closeCandidates = [
    'button[aria-label="閉じる"]',
    'button[aria-label="Close"]',
    'button:has-text("閉じる")',
    'button:has-text("×")',
    'button:has-text("✕")',
    'button:has-text("X")',
    'a:has-text("閉じる")',
    '[role="button"][aria-label="閉じる"]',
  ];

  for (const selector of closeCandidates) {
    const button = modalFrame.locator(selector).first();
    if (await button.count()) {
      try {
        await button.click({ timeout: 2000 });
        await page.waitForTimeout(500);
        info(`Dismissed blocking modal via selector: ${selector}`);
        return true;
      } catch {
        // Try next candidate
      }
    }
  }

  const programmaticClose = modalFrame.locator(".ab-programmatic-close-button").first();
  if (await programmaticClose.count()) {
    try {
      await programmaticClose.click({ timeout: 2000 });
      await page.waitForTimeout(500);
      info("Dismissed blocking modal via .ab-programmatic-close-button");
      return true;
    } catch {
      // continue fallback
    }
  }

  const frameCloseButton = modalFrame.locator(".ab-close-button").first();
  if (await frameCloseButton.count()) {
    try {
      await frameCloseButton.click({ timeout: 2000 });
      await page.waitForTimeout(500);
      info("Dismissed blocking modal via .ab-close-button in iframe");
      return true;
    } catch {
      // continue fallback
    }
  }

  try {
    const clicked = await page.evaluate((selector) => {
      const iframe = document.querySelector(selector) as HTMLIFrameElement | null;
      const doc = iframe?.contentDocument;
      if (!doc) return false;

      const button = doc.querySelector(
        ".ab-programmatic-close-button, .ab-close-button",
      ) as HTMLElement | null;
      if (button) {
        button.click();
        return true;
      }

      const body = doc.body as HTMLElement | null;
      if (body) {
        body.click();
        return true;
      }

      return false;
    }, iframeSelector);

    if (clicked) {
      await page.waitForTimeout(500);
      info("Dismissed blocking modal via iframe DOM click fallback");
      return true;
    }
  } catch {
    // ignore and continue fallback
  }

  try {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    if (!(await iframe.count())) {
      info("Dismissed blocking modal via Escape");
      return true;
    }
  } catch {
    // ignore and continue fallback
  }

  try {
    const removed = await page.evaluate((selector) => {
      const iframe = document.querySelector(selector);
      if (!iframe) return false;

      const root = iframe.closest('.ab-iam-root, [role="complementary"]');
      if (root instanceof HTMLElement) {
        root.remove();
        return true;
      }

      iframe.remove();
      return true;
    }, iframeSelector);

    if (removed) {
      await page.waitForTimeout(500);
      info("Dismissed blocking modal by removing overlay from DOM");
      return true;
    }
  } catch {
    // ignore and fall through
  }

  warn("Detected blocking modal iframe, but could not dismiss it automatically");
  return false;
}

interface RefreshWaitProgress {
  elapsedSeconds: number;
  incompleteAccounts: string[];
  maxWaitMinutes: number;
  nextCheckSeconds: number;
  remainingCount: number;
}

interface RefreshOptions {
  maxWaitMinutes?: number;
  pollIntervalMs?: number;
  onWaiting?: (progress: RefreshWaitProgress) => Promise<void> | void;
}

export function getMaxWaitMinutes(env: NodeJS.ProcessEnv = process.env): number {
  const configuredValue = Number(env.MAX_WAIT_MINUTES);
  return Number.isFinite(configuredValue) && configuredValue > 0
    ? configuredValue
    : DEFAULT_MAX_WAIT_MINUTES;
}

export async function clickRefreshButton(
  page: Page,
  options: RefreshOptions = {},
): Promise<RefreshResult> {
  const maxWaitMinutes = options.maxWaitMinutes ?? getMaxWaitMinutes();
  const maxWaitTimeMs = maxWaitMinutes * 60 * 1000;
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  debug("Looking for refresh button...");

  // Navigate to home and click refresh button
  await page.goto(mfUrls.home);
  await page.waitForLoadState("networkidle");

  await dismissBlockingModal(page);

  const refreshButton = page.locator('a:has-text("一括更新")').first();
  try {
    await refreshButton.click({ timeout: 5000 });
  } catch (error) {
    const dismissed = await dismissBlockingModal(page);
    if (!dismissed) {
      throw error;
    }
    await refreshButton.click({ timeout: 5000 });
  }

  info("Refreshing accounts...");

  // Wait for refresh to start
  await page.waitForTimeout(3000);

  // Navigate to accounts page to check update status
  await navigateToAccountsPage(page);

  info("Waiting for all updates to complete on /accounts page...");

  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTimeMs) {
    const { incompleteAccounts, remainingCount } = await getRefreshStatus(page);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    info(`[${elapsed}s] 残り: ${remainingCount}`);

    await options.onWaiting?.({
      elapsedSeconds: elapsed,
      incompleteAccounts,
      maxWaitMinutes,
      nextCheckSeconds: Math.round(pollIntervalMs / 1000),
      remainingCount,
    });

    if (remainingCount === 0) {
      info("All updates completed!");
      return { completed: true, incompleteAccounts: [] };
    }

    // Wait and navigate to accounts page again to get fresh status
    // Using goto instead of reload to avoid ERR_ABORTED when frame is detached
    await page.waitForTimeout(pollIntervalMs);
    await navigateToAccountsPage(page);
  }

  // Timeout: get list of accounts still updating
  const { incompleteAccounts, remainingCount } = await getRefreshStatus(page);

  warn(`Max wait time exceeded. ${incompleteAccounts.length} accounts still updating:`);
  for (const account of incompleteAccounts) {
    warn(`  - ${account}`);
  }

  return { completed: false, incompleteAccounts, remainingCount };
}
