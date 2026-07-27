import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { mfUrls } from "@mf-dashboard/meta/urls";
import { chromium } from "playwright";
import { loginWithAuthState } from "../../src/auth/login.js";
import { createBrowserContext } from "../../src/browser/context.js";
import { getCurrentGroup, switchGroup } from "../../src/scrapers/group.js";

export const SCREENSHOT_DIR = path.resolve(process.cwd(), "tests/e2e/screenshots");

const ROOT_ENV_PATH = path.resolve(process.cwd(), "../../.env");

let defaultGroupId: string | null = null;

export function ensureScreenshotDir(): void {
  if (!existsSync(SCREENSHOT_DIR)) {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

export async function setup() {
  try {
    process.loadEnvFile(ROOT_ENV_PATH);
  } catch {
    // CI environment
  }

  console.log("Setting up E2E tests...");
  const browser = await chromium.launch({ headless: true });
  const context = await createBrowserContext(browser, { useAuthState: true });
  const page = await context.newPage();

  try {
    await loginWithAuthState(page, context);
    console.log("Login successful, auth state ready");

    // ホームに遷移してデフォルトグループをキャプチャ
    await page.goto(mfUrls.home, { waitUntil: "domcontentloaded" });
    const group = await getCurrentGroup(page);
    defaultGroupId = group?.id ?? null;
    console.log(defaultGroupId ? "Default group state captured" : "No default group found");
  } finally {
    await browser.close();
  }
}

export async function teardown() {
  if (!defaultGroupId) {
    console.log("No default group to restore, skipping teardown");
    return;
  }

  console.log("Restoring default group state");
  const browser = await chromium.launch({ headless: true });
  const context = await createBrowserContext(browser, { useAuthState: true });
  const page = await context.newPage();

  try {
    await page.goto(mfUrls.home, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    const currentGroup = await getCurrentGroup(page);
    if (currentGroup?.id === defaultGroupId) {
      console.log("Group already correct, no restore needed");
      return;
    }

    await switchGroup(page, defaultGroupId);
    console.log("Successfully restored default group state");
  } catch (err) {
    console.error("Failed to restore default group:", err);
  } finally {
    await browser.close();
  }
}
