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

function createPage(url: string): Page {
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
    goto: vi.fn<() => Promise<null>>().mockResolvedValue(null),
    locator: vi.fn<(selector: string) => unknown>((selector) =>
      selector.includes("one-time-code") ? otpLocator : locator,
    ),
    url: vi.fn<() => string>(() => url),
    waitForURL: vi.fn<(matcher: unknown) => Promise<void>>((matcher) => {
      if (typeof matcher === "function") {
        return Promise.reject(new Error("URL did not change"));
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
    const page = createPage("https://moneyforward.com/");

    await expect(login(page)).resolves.toBeUndefined();
  });
});
