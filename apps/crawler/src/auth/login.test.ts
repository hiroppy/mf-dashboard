import type { Page } from "playwright";
import { beforeEach, describe, expect, test, vi } from "vitest";

type AnyMock = (...args: any[]) => any;

const { getCredentialsMock, getOtpMock } = vi.hoisted(() => ({
  getCredentialsMock: vi.fn<AnyMock>(),
  getOtpMock: vi.fn<AnyMock>(),
}));

vi.mock("./credentials.js", () => ({
  getCredentials: getCredentialsMock,
  getOTP: getOtpMock,
}));

import { login } from "./login.js";

function createPage() {
  let currentUrl = "";
  let navigationCount = 0;
  const requestedSelectors: string[] = [];

  const locator = vi.fn<AnyMock>((selector: string) => {
    requestedSelectors.push(selector);
    return {
      first: vi.fn<AnyMock>().mockReturnThis(),
      waitFor: vi.fn<AnyMock>(),
      fill: vi.fn<AnyMock>(),
      click: vi.fn<AnyMock>(),
    };
  });

  const page = {
    goto: vi.fn<AnyMock>(async (url: string) => {
      navigationCount += 1;
      currentUrl = navigationCount === 1 ? url : "https://moneyforward.com/";
    }),
    locator,
    url: vi.fn<AnyMock>(() => currentUrl),
    waitForURL: vi.fn<AnyMock>(),
  } as unknown as Page;

  return { page, requestedSelectors };
}

describe("login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOtpMock.mockResolvedValue("123456");
  });

  test("skips OTP handling for Basic authentication", async () => {
    getCredentialsMock.mockResolvedValue({
      username: "user-a@example.com",
      password: "test-password",
      requiresOtp: false,
    });
    const { page, requestedSelectors } = createPage();

    await login(page);

    expect(getOtpMock).not.toHaveBeenCalled();
    expect(requestedSelectors).not.toContain(
      'input[autocomplete="one-time-code"], input[name*="otp"], input[name*="code"]',
    );
  });

  test("handles OTP for 1Password authentication", async () => {
    getCredentialsMock.mockResolvedValue({
      username: "user-a@example.com",
      password: "test-password",
      requiresOtp: true,
    });
    const { page } = createPage();

    await login(page);

    expect(getOtpMock).toHaveBeenCalledOnce();
  });
});
