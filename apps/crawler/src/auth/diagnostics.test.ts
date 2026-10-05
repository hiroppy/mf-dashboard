import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import { afterEach, describe, expect, test, vi } from "vitest";
import { info, warn } from "../logger.js";
import {
  safeErrorDetails,
  safePageLocation,
  withAuthDiagnostics,
  writeCrawlerDiagnostic,
} from "./diagnostics.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(info).mockReset();
  vi.mocked(warn).mockReset();
});

describe("safe authentication diagnostics", () => {
  test("serialization and warning failures never escape", () => {
    const warning = vi.mocked(warn).mockImplementation(() => {
      throw new Error("synthetic-warning-failure");
    });
    expect(() => writeCrawlerDiagnostic({ event: "test", value: 1n })).not.toThrow();
    expect(warning).toHaveBeenCalledWith("Could not persist crawler diagnostic");
  });

  test("stdout failure still allows the diagnostic file to be persisted", () => {
    const directory = mkdtempSync(join(tmpdir(), "mf-diagnostics-stdout-"));
    const destination = join(directory, "run.ndjson");
    vi.stubEnv("CRAWLER_DIAGNOSTIC_PATH", destination);
    vi.mocked(info).mockImplementation(() => {
      throw new Error("synthetic-stdout-failure");
    });
    try {
      expect(() => writeCrawlerDiagnostic({ event: "test" })).not.toThrow();
      expect(JSON.parse(readFileSync(destination, "utf8"))).toMatchObject({ event: "test" });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("file persistence and warning failures never escape", () => {
    const directory = mkdtempSync(join(tmpdir(), "mf-diagnostics-write-failure-"));
    vi.stubEnv("CRAWLER_DIAGNOSTIC_PATH", directory);
    const warning = vi.mocked(warn).mockImplementation(() => {
      throw new Error("synthetic-warning-failure");
    });
    try {
      expect(() => writeCrawlerDiagnostic({ event: "test" })).not.toThrow();
      expect(warning).toHaveBeenCalledWith("Could not persist crawler diagnostic");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("keeps only error category, known network code and numeric timeout", () => {
    const failure = new Error(
      "Timeout 10000ms exceeded; user-a@example.com password=secret net::ERR_CONNECTION_RESET https://id.moneyforward.com/?otp=123456",
    );
    failure.name = "TimeoutError";
    expect(safeErrorDetails(failure)).toEqual({
      error_type: "timeout",
      network_code: "ERR_CONNECTION_RESET",
      timeout_ms: 10000,
    });
    expect(safeErrorDetails(new Error("net::ERR_PRIVATE_SECRET"))).toEqual({
      error_type: "operation_failed",
      network_code: null,
      timeout_ms: null,
    });
  });

  test.each([
    ["https://id.moneyforward.com/sign_in/password?token=secret", "mfid_password"],
    ["https://moneyforward.com/accounts/secret-account", "me_accounts"],
    ["https://moneyforward.com.attacker.example/accounts", "other"],
    ["https://id.moneyforward.com/secret-path", "mfid_other"],
    ["invalid-url-secret", "other"],
  ])("maps URLs to fixed labels", (url, label) => {
    expect(safePageLocation(url)).toBe(label);
  });

  test("persists phase and network events before failure, without raw personal data, and removes listeners", async () => {
    const directory = mkdtempSync(join(tmpdir(), "mf-diagnostics-"));
    const destination = join(directory, "run.ndjson");
    vi.stubEnv("CRAWLER_DIAGNOSTIC_PATH", destination);
    const frame = {};
    const page = Object.assign(new EventEmitter(), {
      url: () => "https://id.moneyforward.com/sign_in?token=secret-token",
      mainFrame: () => frame,
    });
    const failure = new Error(
      "page.goto: net::ERR_NAME_NOT_RESOLVED user-a@example.com secret-password",
    );
    try {
      await expect(
        withAuthDiagnostics(page as unknown as Page, async (checkpoint) => {
          checkpoint("credentials_fetch");
          checkpoint("mfid_open");
          const request = {
            isNavigationRequest: () => true,
            frame: () => frame,
            failure: () => ({ errorText: failure.message }),
          };
          page.emit("requestfailed", request);
          page.emit("response", { request: () => request, status: () => 503 });
          // Subresources and successful responses are omitted.
          page.emit("response", { request: () => request, status: () => 200 });
          page.emit("requestfailed", { isNavigationRequest: () => false });
          expect(readFileSync(destination, "utf8")).toContain("request_failed");
          throw failure;
        }),
      ).rejects.toBe(failure);
      const content = readFileSync(destination, "utf8");
      const records = content
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(records.map((record) => record.event)).toEqual([
        "phase_started",
        "phase_done",
        "phase_started",
        "request_failed",
        "http_error",
        "auth_failed",
      ]);
      expect(records.at(-1)).toMatchObject({
        phase: "mfid_open",
        network_code: "ERR_NAME_NOT_RESOLVED",
        location: "mfid_sign_in",
      });
      expect(records.find((record) => record.event === "http_error").http_status).toBe(503);
      for (const secret of ["secret-token", "secret-password", "user-a@example.com", "https://"]) {
        expect(content).not.toContain(secret);
      }
      expect(statSync(destination).mode & 0o777).toBe(0o600);
      expect(page.listenerCount("requestfailed")).toBe(0);
      expect(page.listenerCount("response")).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
