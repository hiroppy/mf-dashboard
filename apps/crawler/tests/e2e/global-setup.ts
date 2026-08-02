import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { mfUrls } from "@mf-dashboard/meta/urls";
import { chromium } from "playwright";
import { loginWithAuthState } from "../../src/auth/login.js";
import { createBrowserContext } from "../../src/browser/context.js";
import { getSelectedGroupId, switchGroupAnonymously } from "./group-state.js";

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
    defaultGroupId = await getSelectedGroupId(page);
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

    const currentGroupId = await getSelectedGroupId(page);
    if (currentGroupId === defaultGroupId) {
      console.log("Group already correct, no restore needed");
      return;
    }

    await switchGroupAnonymously(page, defaultGroupId);
    console.log("Successfully restored default group state");
  } catch {
    throw new Error("Failed to restore default group state");
  } finally {
    await browser.close();
  }
}
