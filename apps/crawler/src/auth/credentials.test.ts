import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { getCredentials, getOTP, generateTotp } from "./credentials.js";

describe("credentials", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env = {
      ...originalEnv,
      MONEY_FORWARD_EMAIL: "user-a@example.com",
      MONEY_FORWARD_PASSWORD: "test-password",
      MONEY_FORWARD_TOTP_SECRET: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = originalEnv;
  });

  describe("getCredentials", () => {
    test("returns credentials from environment variables", async () => {
      const result = await getCredentials();

      expect(result).toEqual({
        username: "user-a@example.com",
        password: "test-password",
      });
    });

    test("throws error when email is not set", async () => {
      delete process.env.MONEY_FORWARD_EMAIL;

      await expect(getCredentials()).rejects.toThrow("MONEY_FORWARD_EMAIL が設定されていません");
    });

    test("throws error when password is not set", async () => {
      delete process.env.MONEY_FORWARD_PASSWORD;

      await expect(getCredentials()).rejects.toThrow("MONEY_FORWARD_PASSWORD が設定されていません");
    });
  });

  describe("getOTP", () => {
    test("returns OTP generated from environment variable", async () => {
      vi.setSystemTime(new Date("1970-01-01T00:00:59Z"));

      const result = await getOTP();

      expect(result).toBe("287082");
    });

    test("generates OTP from otpauth URI", () => {
      const result = generateTotp(
        "otpauth://totp/MoneyForward:user-a@example.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=MoneyForward",
        Date.parse("1970-01-01T00:00:59Z"),
      );

      expect(result).toBe("287082");
    });

    test("throws error when TOTP secret is not set", async () => {
      delete process.env.MONEY_FORWARD_TOTP_SECRET;

      await expect(getOTP()).rejects.toThrow("MONEY_FORWARD_TOTP_SECRET が設定されていません");
    });

    test("throws error when TOTP secret is not base32", () => {
      expect(() => generateTotp("invalid-secret!")).toThrow(
        "MONEY_FORWARD_TOTP_SECRET は base32 形式で設定してください",
      );
    });
  });
});
