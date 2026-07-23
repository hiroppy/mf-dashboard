import type { RefreshResult } from "@mf-dashboard/db/types";
import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Page } from "playwright";
import { debug, info, warn } from "../logger.js";

const DEFAULT_MAX_WAIT_MINUTES = 20;
const POLL_INTERVAL_MS = 30000; // 30 seconds
const NAVIGATION_RETRY_DELAY_MS = 1000;

export async function navigateToAccountsPage(page: Page): Promise<void> {
  const MAX_RETRIES = 1;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await page.goto(mfUrls.accounts, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForLoadState("networkidle");
      return;
    } catch (err) {
      if (page.isClosed()) {
        throw err;
      }

      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("net::ERR_ABORTED") || attempt === MAX_RETRIES) {
        throw err;
      }

      await page.waitForTimeout(NAVIGATION_RETRY_DELAY_MS);
    }
  }
}

export async function getRefreshStatus(
  page: Page,
): Promise<{ incompleteAccounts: string[]; remainingCount: number }> {
  const rows = page.locator("#account-table tr:has(td.account-status)");
  const count = await rows.count();
  const incompleteAccounts: string[] = [];
  let remainingCount = 0;

  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const statusCells = row.locator("td.account-status");
    // Multiple td.account-status cells may exist in the same row (e.g., info_msg and normal)
    const allTexts = await statusCells.allTextContents();
    if (allTexts.some((text) => text.trim() === "更新中")) {
      remainingCount++;
      const nameCell = row.locator("td.service a").first();
      const name = await nameCell.textContent();
      if (name) {
        incompleteAccounts.push(name.trim());
      }
    }
  }

  return { incompleteAccounts, remainingCount };
}

export interface RefreshWaitProgress {
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

  const refreshButton = page.locator('a:has-text("一括更新")').first();
  await refreshButton.click();

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
