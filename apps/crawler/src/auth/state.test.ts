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
  });

  describe("getAuthStatePath", () => {
    test("returns path to auth-state.json in data directory", () => {
      const result = getAuthStatePath();
      expect(result).toContain("data");
      expect(result).toContain("auth-state.json");
      expect(path.isAbsolute(result)).toBe(true);
    });
  });

  describe("hasAuthState", () => {
    test("returns true when auth state file exists", () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const result = hasAuthState();

      expect(result).toBe(true);
      expect(existsSync).toHaveBeenCalledWith(expect.stringContaining("auth-state.json"));
    });

    test("returns false when auth state file does not exist", () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = hasAuthState();

      expect(result).toBe(false);
    });
  });
});
