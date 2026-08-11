import { mfUrls } from "@mf-dashboard/meta/urls";
import type { BrowserContext, Page } from "playwright";
import { log, debug } from "../logger.js";
import { getCredentials, getOTP } from "./credentials.js";
import { hasAuthState, saveAuthState } from "./state.js";

const TIMEOUTS = {
  redirect: 2000,
  short: 5000,
  medium: 10000,
  long: 15000,
  login: 30000,
};

const MONEY_FORWARD_ME_ORIGIN = new URL(mfUrls.home).origin;
const AUTHENTICATED_PATHNAME = new URL(mfUrls.accounts).pathname;

const SELECTORS = {
  mfidEmail: 'input[name="mfid_user[email]"]',
  mfidPassword: 'input[name="mfid_user[password]"]',
  mfidSubmit: "#submitto",
  mfidOtpInput: 'input[autocomplete="one-time-code"], input[name*="otp"], input[name*="code"]',
  mfidOtpSubmit: '#submitto, button:text-is("認証する"), button:text-is("Verify")',
  mePassword: 'input[type="password"]',
  meSignIn: 'button:has-text("Sign in")',
};

function isLoggedInUrl(url: string): boolean {
  try {
    const currentUrl = new URL(url);
    return (
      currentUrl.origin === MONEY_FORWARD_ME_ORIGIN &&
      (currentUrl.pathname === AUTHENTICATED_PATHNAME ||
        currentUrl.pathname.startsWith(`${AUTHENTICATED_PATHNAME}/`))
    );
  } catch {
    return false;
  }
}

function buildAccountSelector(username: string): string {
  return `button:has-text("${username}"), button:has-text("メールアドレスでログイン"), button:has-text("Sign in with email")`;
}

async function waitForUrlChange(page: Page, timeout: number = TIMEOUTS.redirect): Promise<void> {
  const initialUrl = page.url();
  try {
    await page.waitForURL((url) => url.toString() !== initialUrl, { timeout });
  } catch {
    // Ignore timeout: no redirect happened
  }
}

async function maybeHandleOtp(
  page: Page,
  {
    inputSelector,
    submitSelector,
    label,
    timeout = TIMEOUTS.short,
  }: {
    inputSelector: string;
    submitSelector: string;
    label: string;
    timeout?: number;
  },
): Promise<void> {
  try {
    debug(`Checking for ${label} OTP...`);
    const otpInput = page.locator(inputSelector).first();
    await otpInput.waitFor({ state: "visible", timeout });

    debug(`${label} OTP required, getting from 1Password...`);
    const otp = await getOTP();
    await otpInput.fill(otp);
    debug("Clicking verify button...");
    await page.locator(submitSelector).first().click();
  } catch {
    debug(`${label} OTP not required`);
  }
}

/**
 * Check if the current session is valid by navigating to Money Forward
 * and checking if we're redirected to login page
 */
async function isSessionValid(page: Page): Promise<boolean> {
  debug("Checking if session is valid...");

  try {
    // Navigate to a page that requires an authenticated Money Forward ME session.
    // The public home page cannot prove that the session is valid.
    await page.goto(mfUrls.accounts, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS.long,
    });

    // Wait a bit for potential redirects
    await waitForUrlChange(page);

    const currentUrl = page.url();
    debug("Current URL after navigation:", currentUrl);

    // If we're on the main site (not login/id page), session is valid
    if (isLoggedInUrl(currentUrl)) {
      log("Session is valid!");
      return true;
    }

    debug("Session is invalid, need to login");
    return false;
  } catch (err) {
    debug("Error checking session:", err);
    return false;
  }
}

/**
 * Login with auth state if available, otherwise perform full login
 */
export async function loginWithAuthState(page: Page, context: BrowserContext): Promise<void> {
  // If auth state exists, check if session is valid
  if (hasAuthState()) {
    debug("Auth state found, checking session validity...");

    const valid = await isSessionValid(page);
    if (valid) {
      debug("Using existing session from auth state");
      return;
    }

    debug("Session expired, performing full login...");
  } else {
    debug("No auth state found, performing full login...");
  }

  // Perform full login
  await login(page);

  // Save auth state after successful login
  await saveAuthState(context);
}

export async function login(page: Page): Promise<void> {
  const { username, password } = await getCredentials();

  debug("Navigating to login page...");
  await page.goto(mfUrls.auth.signIn, {
    waitUntil: "domcontentloaded",
  });

  // Enter email
  debug("Entering email...");
  const emailInput = page.locator(SELECTORS.mfidEmail);
  await emailInput.waitFor({ state: "visible", timeout: TIMEOUTS.medium });
  await emailInput.fill(username);

  // Click sign in button
  debug("Clicking Sign in button...");
  await page.locator(SELECTORS.mfidSubmit).click();

  // Wait for password field
  debug("Waiting for password page...");
  const passwordInput = page.locator(SELECTORS.mfidPassword);
  await passwordInput.waitFor({ state: "visible", timeout: TIMEOUTS.medium });

  // Enter password
  debug("Entering password...");
  await passwordInput.fill(password);
  debug("Clicking Sign in button...");
  await page.locator(SELECTORS.mfidSubmit).click();

  // Check if OTP is required
  await maybeHandleOtp(page, {
    inputSelector: SELECTORS.mfidOtpInput,
    submitSelector: SELECTORS.mfidOtpSubmit,
    label: "MFID",
  });

  // Wait for redirect after login
  debug("Waiting for login to complete...");
  await page.waitForURL(/https:\/\/(id\.)?moneyforward\.com\/.*/, {
    timeout: TIMEOUTS.login,
  });

  // Navigate to Money Forward ME - will redirect to MFID for auth
  debug("Navigating to Money Forward ME...");
  // Don't wait for full load, just start navigation
  await page.goto(mfUrls.signIn);

  // Wait a bit for redirect to start
  await waitForUrlChange(page);

  // If we're still on the ME domain, we might be logged in or need more time
  let currentUrl = page.url();
  debug("URL after initial wait:", currentUrl);
  if (currentUrl.startsWith(mfUrls.signIn)) {
    // Wait for redirect to MFID
    debug("Waiting for MFID redirect...");
    await page.waitForURL(/id\.moneyforward\.com/, {
      timeout: TIMEOUTS.long,
    });
    currentUrl = page.url();
  }

  debug("Current URL:", currentUrl);

  // Check if already on ME home (session is valid)
  if (isLoggedInUrl(currentUrl)) {
    debug("Already logged in to ME!");
    return;
  }

  // Check if we're on account selector or password page
  if (currentUrl.includes("account_selector")) {
    // Click account button (contains email address)
    debug("Account selector found, clicking account...");
    // Try multiple selectors: email address, or Japanese/English text
    const accountButton = page.locator(buildAccountSelector(username)).first();
    await accountButton.waitFor({ state: "visible", timeout: TIMEOUTS.short });

    // Click and wait for navigation (either to password page or directly to ME)
    debug("Clicking account and waiting for navigation...");
    await accountButton.click();

    // Wait for either password page or direct redirect to ME
    await page.waitForURL(/id\.moneyforward\.com\/sign_in\/password|moneyforward\.com\//, {
      timeout: TIMEOUTS.long,
    });
    currentUrl = page.url();
  }

  // Check if we need to enter password or already redirected to ME
  if (currentUrl.includes(mfUrls.auth.password)) {
    // Wait for password page
    debug("Waiting for ME password page...");
    const mePasswordInput = page.locator(SELECTORS.mePassword).first();
    await mePasswordInput.waitFor({ state: "visible", timeout: TIMEOUTS.medium });

    // Enter password
    debug("Entering ME password...");
    await mePasswordInput.fill(password);

    // Click Sign in button
    debug("Clicking Sign in button...");
    await page.locator(SELECTORS.meSignIn).click();

    // Wait for redirect to ME
    debug("Waiting for ME redirect...");
    await page.waitForURL(`${mfUrls.home}**`, { timeout: TIMEOUTS.login });
  } else {
    debug("Already redirected to ME (session exists)");
  }

  // Recheck against an authenticated-only page. moneyforward.com/ itself is
  // publicly accessible and therefore cannot be used as proof of login.
  await page.goto(mfUrls.accounts, {
    waitUntil: "domcontentloaded",
    timeout: TIMEOUTS.long,
  });
  await waitForUrlChange(page);

  if (!isLoggedInUrl(page.url())) {
    throw new Error("Login failed: browser did not reach Money Forward ME");
  }

  log("Login successful!");
}
