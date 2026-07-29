import { mfUrls } from "@mf-dashboard/meta/urls";
import { chromium } from "playwright";
import { login } from "../../src/auth/login.js";
import { createBrowserContext } from "../../src/browser/context.js";

test("signs in with Basic credentials from .env without 2FA", async () => {
  expect(process.env.MF_AUTH_METHOD).toBe("basic");
  expect(process.env.MF_EMAIL).toBeTruthy();
  expect(process.env.MF_PASSWORD).toBeTruthy();

  const browser = await chromium.launch({ headless: true });
  const context = await createBrowserContext(browser);
  const page = await context.newPage();

  try {
    await login(page);

    const currentUrl = new URL(page.url());
    expect(currentUrl.origin).toBe(new URL(mfUrls.home).origin);
    expect(currentUrl.pathname).not.toContain("sign_in");
  } finally {
    await browser.close();
  }
});
