import path from "node:path";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

type AnyMock = (...args: any[]) => any;

// Mock fs module
vi.mock("node:fs", () => ({
  existsSync: vi.fn<AnyMock>(),
}));

import { existsSync } from "node:fs";
import { getAuthStatePath, hasAuthState } from "./state.js";

describe("state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe("getAuthStatePath", () => {
    test("returns path to auth-state.json in data directory", () => {
      const result = getAuthStatePath();
      const expectedPath = path.resolve(import.meta.dirname, "../../../../data/auth-state.json");

      expect(result).toBe(expectedPath);
      expect(path.isAbsolute(result)).toBe(true);
    });

    test("returns configured AUTH_STATE_PATH when set", () => {
      vi.stubEnv("AUTH_STATE_PATH", "/app/crawler-state/auth-state.json");

      const result = getAuthStatePath();

      expect(result).toBe("/app/crawler-state/auth-state.json");
    });
  });

  describe("hasAuthState", () => {
    test("returns true when auth state file exists", () => {
      vi.stubEnv("AUTH_STATE_PATH", "/app/crawler-state/auth-state.json");
      vi.mocked(existsSync).mockReturnValue(true);

      const result = hasAuthState();

      expect(result).toBe(true);
      expect(existsSync).toHaveBeenCalledWith("/app/crawler-state/auth-state.json");
    });

    test("returns false when auth state file does not exist", () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = hasAuthState();

      expect(result).toBe(false);
    });
  });
});
