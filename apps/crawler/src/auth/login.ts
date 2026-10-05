import { mfUrls } from "@mf-dashboard/meta/urls";
import type { BrowserContext, Page } from "playwright";
import { log, debug } from "../logger.js";
import { navigateToAccountsPage } from "../scrapers/refresh.js";
import { getCredentials, getOTP } from "./credentials.js";
import { withAuthDiagnostics, type AuthCheckpoint } from "./diagnostics.js";
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
    checkpoint,
  }: {
    inputSelector: string;
    submitSelector: string;
    label: string;
    timeout?: number;
    checkpoint: AuthCheckpoint;
  },
): Promise<void> {
  const otpInput = page.locator(inputSelector).first();
  checkpoint("otp_probe");
  try {
    debug(`Checking for ${label} OTP...`);
    await otpInput.waitFor({ state: "visible", timeout });
  } catch (failure) {
    if (failure instanceof Error && failure.name === "TimeoutError") {
      debug(`${label} OTP not required`);
      return;
    }
    throw failure;
  }
  checkpoint("otp_fetch");
  debug(`${label} OTP required, getting from 1Password...`);
  const otp = await getOTP();
  checkpoint("otp_submit");
  await otpInput.fill(otp);
  debug("Clicking verify button...");
  await page.locator(submitSelector).first().click();
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
    await navigateToAccountsPage(page);

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
  return withAuthDiagnostics(page, async (checkpoint) => {
    // If auth state exists, check if session is valid
    if (hasAuthState()) {
      checkpoint("session_check");
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
    await performLogin(page, checkpoint);

    // Save auth state after successful login
    checkpoint("auth_state_save");
    await saveAuthState(context);
  });
}

export async function login(page: Page): Promise<void> {
  return withAuthDiagnostics(page, (checkpoint) => performLogin(page, checkpoint));
}

async function performLogin(page: Page, checkpoint: AuthCheckpoint): Promise<void> {
  checkpoint("credentials_fetch");
  const { username, password } = await getCredentials();

  checkpoint("mfid_open");
  debug("Navigating to login page...");
  await page.goto(mfUrls.auth.signIn, {
    waitUntil: "domcontentloaded",
  });

  // Enter email
  checkpoint("email_input");
  debug("Entering email...");
  const emailInput = page.locator(SELECTORS.mfidEmail);
  await emailInput.waitFor({ state: "visible", timeout: TIMEOUTS.medium });
  await emailInput.fill(username);

  // Click sign in button
  checkpoint("email_submit");
  debug("Clicking Sign in button...");
  await page.locator(SELECTORS.mfidSubmit).click();

  // Wait for password field
  checkpoint("password_input");
  debug("Waiting for password page...");
  const passwordInput = page.locator(SELECTORS.mfidPassword);
  await passwordInput.waitFor({ state: "visible", timeout: TIMEOUTS.medium });

  // Enter password
  debug("Entering password...");
  await passwordInput.fill(password);
  checkpoint("password_submit");
  debug("Clicking Sign in button...");
  await page.locator(SELECTORS.mfidSubmit).click();

  // Check if OTP is required
  await maybeHandleOtp(page, {
    inputSelector: SELECTORS.mfidOtpInput,
    submitSelector: SELECTORS.mfidOtpSubmit,
    label: "MFID",
    checkpoint,
  });

  // Wait for redirect after login
  checkpoint("mfid_redirect");
  debug("Waiting for login to complete...");
  await page.waitForURL(/https:\/\/(id\.)?moneyforward\.com\/.*/, {
    timeout: TIMEOUTS.login,
  });

  // Navigate to Money Forward ME - will redirect to MFID for auth
  checkpoint("me_open");
  debug("Navigating to Money Forward ME...");
  // Don't wait for full load, just start navigation
  await page.goto(mfUrls.signIn);

  // Wait a bit for redirect to start
  await waitForUrlChange(page);

  // If we're still on the ME domain, we might be logged in or need more time
  let currentUrl = page.url();
  debug("URL after initial wait:", currentUrl);
  if (currentUrl.startsWith(mfUrls.signIn)) {
    checkpoint("me_redirect");
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
    checkpoint("account_select");
    // Click account button (contains email address)
    debug("Account selector found, clicking account...");
    // Try multiple selectors: email address, or Japanese/English text
    const accountButton = page.locator(buildAccountSelector(username)).first();
    await accountButton.waitFor({ state: "visible", timeout: TIMEOUTS.short });

    // Click and wait for navigation (either to password page or directly to ME)
    debug("Clicking account and waiting for navigation...");
    await accountButton.click();

    checkpoint("account_redirect");
    // Wait for either password page or direct redirect to ME
    await page.waitForURL(/id\.moneyforward\.com\/sign_in\/password|moneyforward\.com\//, {
      timeout: TIMEOUTS.long,
    });
    currentUrl = page.url();
  }

  // Check if we need to enter password or already redirected to ME
  if (currentUrl.includes(mfUrls.auth.password)) {
    checkpoint("me_password_input");
    // Wait for password page
    debug("Waiting for ME password page...");
    const mePasswordInput = page.locator(SELECTORS.mePassword).first();
    await mePasswordInput.waitFor({ state: "visible", timeout: TIMEOUTS.medium });

    // Enter password
    debug("Entering ME password...");
    await mePasswordInput.fill(password);

    checkpoint("me_password_submit");
    // Click Sign in button
    debug("Clicking Sign in button...");
    await page.locator(SELECTORS.meSignIn).click();

    // Wait for redirect to ME
    checkpoint("me_login_redirect");
    debug("Waiting for ME redirect...");
    await page.waitForURL(`${mfUrls.home}**`, { timeout: TIMEOUTS.login });
  } else {
    debug("Already redirected to ME (session exists)");
  }

  // Recheck against an authenticated-only page. moneyforward.com/ itself is
  // publicly accessible and therefore cannot be used as proof of login.
  checkpoint("session_verify");
  await navigateToAccountsPage(page);
  await waitForUrlChange(page);

  if (!isLoggedInUrl(page.url())) {
    throw new Error("Login failed: browser did not reach Money Forward ME");
  }

  log("Login successful!");
}
