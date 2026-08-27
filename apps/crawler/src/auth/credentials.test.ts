import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

type AnyMock = (...args: any[]) => any;

// Use vi.hoisted to create mock before hoisting
const { mockResolve, mockCreateClient } = vi.hoisted(() => {
  const mockResolve = vi.fn<AnyMock>();
  const mockCreateClient = vi.fn<AnyMock>().mockResolvedValue({
    secrets: {
      resolve: mockResolve,
    },
  });
  return { mockResolve, mockCreateClient };
});

// Mock 1Password SDK
vi.mock("@1password/sdk", () => ({
  createClient: mockCreateClient,
}));

// Mock process.exit
vi.spyOn(process, "exit").mockImplementation(() => {
  throw new Error("process.exit called");
});

import { getCredentials, getOTP, _resetOpClient } from "./credentials.js";

describe("credentials", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetOpClient();
    process.env = {
      ...originalEnv,
      OP_SERVICE_ACCOUNT_TOKEN: "test-token",
      OP_VAULT: "test-vault",
      OP_ITEM: "test-item",
      OP_TOTP_FIELD: "totp",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getCredentials", () => {
    test("returns credentials from 1Password", async () => {
      mockResolve.mockImplementation((path: string) => {
        if (path.includes("username")) return Promise.resolve("test-user@example.com");
        if (path.includes("password")) return Promise.resolve("test-password");
        return Promise.resolve("");
      });

      const result = await getCredentials();

      expect(result).toEqual({
        username: "test-user@example.com",
        password: "test-password",
      });
      expect(mockResolve).toHaveBeenCalledWith("op://test-vault/test-item/username");
      expect(mockResolve).toHaveBeenCalledWith("op://test-vault/test-item/password");
    });

    test("throws error when credentials are empty", async () => {
      mockResolve.mockResolvedValue("");

      await expect(getCredentials()).rejects.toThrow("Failed to get credentials from 1Password");
    });

    test("exits when OP_SERVICE_ACCOUNT_TOKEN is not set", async () => {
      delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
      _resetOpClient();

      await expect(getCredentials()).rejects.toThrow("process.exit called");
    });
  });

  describe("CREDENTIALS_SOURCE=env", () => {
    beforeEach(() => {
      process.env.CREDENTIALS_SOURCE = "env";
    });

    test("returns credentials from environment variables without calling 1Password", async () => {
      process.env.MF_USERNAME = "user-a@example.com";
      process.env.MF_PASSWORD = "test-password";

      const result = await getCredentials();

      expect(result).toEqual({
        username: "user-a@example.com",
        password: "test-password",
      });
      expect(mockCreateClient).not.toHaveBeenCalled();
      expect(mockResolve).not.toHaveBeenCalled();
    });

    test("throws error when MF_PASSWORD is not set", async () => {
      process.env.MF_USERNAME = "user-a@example.com";
      delete process.env.MF_PASSWORD;

      await expect(getCredentials()).rejects.toThrow("MF_USERNAME と MF_PASSWORD が必要です");
    });

    test("does not fall back to 1Password when OP_SERVICE_ACCOUNT_TOKEN is missing", async () => {
      delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
      process.env.MF_USERNAME = "user-a@example.com";
      process.env.MF_PASSWORD = "test-password";

      await expect(getCredentials()).resolves.toEqual({
        username: "user-a@example.com",
        password: "test-password",
      });
    });

    test("throws a descriptive error when OTP is required", async () => {
      await expect(getOTP()).rejects.toThrow("CREDENTIALS_SOURCE=env では OTP を取得できません");
      expect(mockCreateClient).not.toHaveBeenCalled();
    });
  });

  describe("getOTP", () => {
    test("returns OTP from 1Password", async () => {
      mockResolve.mockResolvedValue("123456");

      const result = await getOTP();

      expect(result).toBe("123456");
      expect(mockResolve).toHaveBeenCalledWith("op://test-vault/test-item/totp?attribute=totp");
    });

    test("throws error when OP_TOTP_FIELD is not set", async () => {
      delete process.env.OP_TOTP_FIELD;

      await expect(getOTP()).rejects.toThrow("OP_TOTP_FIELD が設定されていません");
    });

    test("throws error when OTP is empty", async () => {
      mockResolve.mockResolvedValue("");

      await expect(getOTP()).rejects.toThrow("OTP の取得に失敗しました");
    });
  });
});
