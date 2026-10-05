import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Page } from "playwright";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { debug, getCredentials, getOTP, log, info, warn } = vi.hoisted(() => ({
  debug: vi.fn<(...args: unknown[]) => void>(),
  getCredentials: vi.fn<() => Promise<{ password: string; username: string }>>(),
  getOTP: vi.fn<() => Promise<string>>(),
  log: vi.fn<(...args: unknown[]) => void>(),
  info: vi.fn<(...args: unknown[]) => void>(),
  warn: vi.fn<(...args: unknown[]) => void>(),
}));

vi.mock("../logger.js", () => ({ debug, log, info, warn }));
vi.mock("./credentials.js", () => ({
  getCredentials,
  getOTP,
}));

import { login } from "./login.js";

function createPage(
  finalUrl: string,
  { abortAccountsOnce = false, viaPassword = false, otpVisible = false } = {},
): Page {
  let currentUrl: string = mfUrls.auth.signIn;
  let accountsNavigationAborted = false;
  const locator = {
    click: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    fill: vi.fn<(value: string) => Promise<void>>().mockResolvedValue(undefined),
    first: vi.fn<() => unknown>(),
    waitFor: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  locator.first.mockReturnValue(locator);

  const otpLocator = {
    ...locator,
    first: vi.fn<() => unknown>(),
    waitFor: vi.fn<() => Promise<void>>().mockImplementation(async () => {
      if (!otpVisible) {
        const failure = new Error("OTP input is not visible");
        failure.name = "TimeoutError";
        throw failure;
      }
    }),
  };
  otpLocator.first.mockReturnValue(otpLocator);

  return {
    on: vi.fn<() => void>(),
    off: vi.fn<() => void>(),
    goto: vi.fn<(url: string) => Promise<null>>().mockImplementation(async (url) => {
      if (url === mfUrls.signIn) {
        currentUrl = viaPassword ? mfUrls.auth.password : finalUrl;
      } else if (url === mfUrls.accounts) {
        if (abortAccountsOnce && !accountsNavigationAborted) {
          accountsNavigationAborted = true;
          throw new Error("page.goto: net::ERR_ABORTED");
        }
        currentUrl = finalUrl;
      }
      return null;
    }),
    isClosed: vi.fn<() => boolean>(() => false),
    locator: vi.fn<(selector: string) => unknown>((selector) =>
      selector.includes("one-time-code") ? otpLocator : locator,
    ),
    url: vi.fn<() => string>(() => currentUrl),
    waitForLoadState: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    waitForTimeout: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    waitForURL: vi.fn<(matcher: unknown) => Promise<void>>((matcher) => {
      if (typeof matcher === "function") {
        return Promise.reject(new Error("URL did not change"));
      }
      if (typeof matcher === "string") {
        currentUrl = finalUrl;
      }
      return Promise.resolve();
    }),
  } as unknown as Page;
}

describe("login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCredentials.mockResolvedValue({
      username: "user-a@example.com",
      password: "test-password",
    });
  });

  test("rejects when the browser remains on the MFID sign-in page", async () => {
    const page = createPage("https://id.moneyforward.com/sign_in");

    await expect(login(page)).rejects.toThrow("Login failed");
    expect(log).not.toHaveBeenCalledWith("Login successful!");
  });

  test("resolves when the browser reaches Money Forward ME", async () => {
    const page = createPage(mfUrls.accounts, { viaPassword: true });

    await expect(login(page)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("Login successful!");
  });

  test("rejects the public Money Forward home page", async () => {
    const page = createPage(mfUrls.home);

    await expect(login(page)).rejects.toThrow("Login failed");
    expect(log).not.toHaveBeenCalledWith("Login successful!");
  });

  test("retries the authenticated-page probe after aborted navigation", async () => {
    const page = createPage(mfUrls.accounts, {
      abortAccountsOnce: true,
      viaPassword: true,
    });

    await expect(login(page)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("Login successful!");
  });

  test("rejects a lookalike Money Forward origin", async () => {
    const page = createPage("https://moneyforward.com.attacker.example/");

    await expect(login(page)).rejects.toThrow("Login failed");
    expect(log).not.toHaveBeenCalledWith("Login successful!");
  });

  test("records credentials provider failures without logging the exception message", async () => {
    const failure = new Error("ENOTFOUND user-a@example.com secret-password");
    getCredentials.mockRejectedValueOnce(failure);
    await expect(login(createPage(mfUrls.accounts))).rejects.toBe(failure);
    const output = JSON.stringify(info.mock.calls);
    expect(output).toContain("credentials_fetch");
    expect(output).toContain("ENOTFOUND");
    expect(output).not.toContain("user-a@example.com");
    expect(output).not.toContain("secret-password");
  });

  test("propagates OTP retrieval failures and records otp_fetch", async () => {
    const failure = new Error("OTP provider failed with secret-otp");
    getOTP.mockRejectedValueOnce(failure);
    await expect(login(createPage(mfUrls.accounts, { otpVisible: true }))).rejects.toBe(failure);
    const records = info.mock.calls.map(([line]) =>
      JSON.parse(String(line).replace("MF_CRAWLER_DIAGNOSTIC ", "")),
    );
    expect(records.at(-1)).toMatchObject({ event: "auth_failed", phase: "otp_fetch" });
    expect(JSON.stringify(records)).not.toContain("secret-otp");
  });

  test("propagates OTP submission failures and records otp_submit", async () => {
    getOTP.mockResolvedValueOnce("123456");
    const page = createPage(mfUrls.accounts, { otpVisible: true });
    const failure = new Error("OTP submit failed");
    // email submit, password submit, then OTP submit
    // The page stub's click is an arrow mock and does not depend on this.
    // oxlint-disable-next-line typescript/unbound-method
    vi.mocked(page.locator("#submitto").click)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(failure);
    await expect(login(page)).rejects.toBe(failure);
    expect(JSON.stringify(info.mock.calls)).toContain("otp_submit");
    expect(JSON.stringify(info.mock.calls)).not.toContain("123456");
  });
});
