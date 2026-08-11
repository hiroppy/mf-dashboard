import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Page } from "playwright";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { debug, getCredentials, log } = vi.hoisted(() => ({
  debug: vi.fn<(...args: unknown[]) => void>(),
  getCredentials: vi.fn<() => Promise<{ password: string; username: string }>>(),
  log: vi.fn<(...args: unknown[]) => void>(),
}));

vi.mock("../logger.js", () => ({ debug, log }));
vi.mock("./credentials.js", () => ({
  getCredentials,
  getOTP: vi.fn<() => Promise<string>>(),
}));

import { login } from "./login.js";

function createPage(finalUrl: string, viaPassword = false): Page {
  let currentUrl: string = mfUrls.auth.signIn;
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
    waitFor: vi.fn<() => Promise<void>>().mockRejectedValue(new Error("OTP input is not visible")),
  };
  otpLocator.first.mockReturnValue(otpLocator);

  return {
    goto: vi.fn<(url: string) => Promise<null>>().mockImplementation(async (url) => {
      if (url === mfUrls.signIn) {
        currentUrl = viaPassword ? mfUrls.auth.password : finalUrl;
      } else if (url === mfUrls.accounts) {
        currentUrl = finalUrl;
      }
      return null;
    }),
    locator: vi.fn<(selector: string) => unknown>((selector) =>
      selector.includes("one-time-code") ? otpLocator : locator,
    ),
    url: vi.fn<() => string>(() => currentUrl),
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
    const page = createPage(mfUrls.accounts, true);

    await expect(login(page)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("Login successful!");
  });

  test("rejects the public Money Forward home page", async () => {
    const page = createPage(mfUrls.home);

    await expect(login(page)).rejects.toThrow("Login failed");
    expect(log).not.toHaveBeenCalledWith("Login successful!");
  });

  test("rejects a lookalike Money Forward origin", async () => {
    const page = createPage("https://moneyforward.com.attacker.example/");

    await expect(login(page)).rejects.toThrow("Login failed");
    expect(log).not.toHaveBeenCalledWith("Login successful!");
  });
});
