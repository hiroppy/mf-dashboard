import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import { afterEach, expect, test, vi } from "vitest";
import { inspectAccountsPage, withAccountsPageDiagnostics } from "./accounts-diagnostics.js";

const missingTable = {
  ready_state: "complete",
  table_count: 0,
  visible_table_count: 0,
  first_table_visible: false,
  status_row_count: 0,
  has_password_input: true,
  has_otp_input: false,
  has_captcha_frame: false,
  maintenance_notice_present: false,
};

function createPage(structure = missingTable) {
  const frame = {};
  return Object.assign(new EventEmitter(), {
    mainFrame: () => frame,
    url: () => "https://moneyforward.com/accounts?token=secret-token",
    isClosed: (): boolean => false,
    evaluate: vi.fn<() => Promise<typeof missingTable>>().mockResolvedValue(structure),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

test("records HTTP status and missing table at failure without raw URLs or exception messages", async () => {
  const directory = mkdtempSync(join(tmpdir(), "accounts-diagnostics-"));
  const destination = join(directory, "run.ndjson");
  vi.stubEnv("CRAWLER_DIAGNOSTIC_PATH", destination);
  const page = createPage();
  const failure = new Error("Timeout 10000ms exceeded; user-a@example.com secret-password");
  failure.name = "TimeoutError";
  try {
    await expect(
      withAccountsPageDiagnostics(
        page as unknown as Page,
        "registered_accounts",
        async (checkpoint) => {
          await checkpoint("navigation");
          const request = { isNavigationRequest: () => true, frame: () => page.mainFrame() };
          page.emit("response", {
            request: () => request,
            status: () => 429,
            url: () => page.url(),
          });
          page.emit("response", {
            request: () => ({ isNavigationRequest: () => false }),
            status: () => 503,
          });
          await checkpoint("table_wait");
          throw failure;
        },
      ),
    ).rejects.toBe(failure);
    const content = readFileSync(destination, "utf8");
    const records = content
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(records.at(-1)).toMatchObject({
      event: "accounts_page_failed",
      operation: "registered_accounts",
      stage: "table_wait",
      http_status: 429,
      location: "me_accounts",
      table_count: 0,
      has_password_input: true,
      error_type: "timeout",
      timeout_ms: 10000,
    });
    expect(records.filter((record) => record.event === "accounts_http_response")).toHaveLength(1);
    for (const secret of ["secret-token", "secret-password", "user-a@example.com", "https://"])
      expect(content).not.toContain(secret);
    expect(page.listenerCount("response")).toBe(0);
    expect(page.listenerCount("requestfailed")).toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("distinguishes a hidden first table from absence of all tables", async () => {
  const page = createPage({
    ...missingTable,
    table_count: 2,
    visible_table_count: 1,
    first_table_visible: false,
  });
  await expect(inspectAccountsPage(page as unknown as Page)).resolves.toMatchObject({
    snapshot_available: true,
    table_count: 2,
    visible_table_count: 1,
    first_table_visible: false,
  });
});

test("records a maintenance notice without storing heading text", async () => {
  const directory = mkdtempSync(join(tmpdir(), "accounts-maintenance-diagnostics-"));
  const destination = join(directory, "run.ndjson");
  vi.stubEnv("CRAWLER_DIAGNOSTIC_PATH", destination);
  const page = createPage({ ...missingTable, maintenance_notice_present: true });
  try {
    await withAccountsPageDiagnostics(
      page as unknown as Page,
      "registered_accounts",
      async (checkpoint) => checkpoint("table_wait"),
    );
    const content = readFileSync(destination, "utf8");
    expect(JSON.parse(content.trim().split("\n").at(-1)!)).toMatchObject({
      maintenance_notice_present: true,
      table_count: 0,
    });
    expect(content).not.toContain("メンテナンス作業中");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("snapshot failure never replaces the crawler failure", async () => {
  const page = createPage();
  page.evaluate.mockRejectedValue(new Error("private-snapshot-failure"));
  const original = new Error("original-crawler-failure");
  await expect(
    withAccountsPageDiagnostics(
      page as unknown as Page,
      "refresh_navigation",
      async (checkpoint) => {
        await checkpoint("navigation");
        throw original;
      },
    ),
  ).rejects.toBe(original);
});

test("limits an unresponsive snapshot to two seconds", async () => {
  vi.useFakeTimers();
  const page = createPage();
  page.evaluate.mockImplementation(() => new Promise(() => {}));
  const pending = inspectAccountsPage(page as unknown as Page);
  await vi.advanceTimersByTimeAsync(2000);
  await expect(pending).resolves.toMatchObject({
    snapshot_available: false,
    snapshot_error_type: "timeout",
  });
  expect(vi.getTimerCount()).toBe(0);
});

test("closed page is recorded without DOM access", async () => {
  const page = createPage();
  page.isClosed = () => true;
  await expect(inspectAccountsPage(page as unknown as Page)).resolves.toEqual({
    snapshot_available: false,
    page_closed: true,
  });
  expect(page.evaluate).not.toHaveBeenCalled();
});

test("diagnostics preserve successful task results", async () => {
  const page = createPage();
  const result = { incompleteAccounts: [], remainingCount: 0 };
  await expect(
    withAccountsPageDiagnostics(page as unknown as Page, "refresh_status", async (checkpoint) => {
      await checkpoint("status_read");
      return result;
    }),
  ).resolves.toBe(result);
});
