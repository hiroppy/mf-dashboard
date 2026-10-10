import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import { afterEach, expect, test, vi } from "vitest";
import { info } from "../logger.js";
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

function diagnosticRecords() {
  return vi
    .mocked(info)
    .mock.calls.map(([message]) => message)
    .filter(
      (message): message is string =>
        typeof message === "string" && message.startsWith("MF_CRAWLER_DIAGNOSTIC "),
    )
    .map((message) => JSON.parse(message.slice("MF_CRAWLER_DIAGNOSTIC ".length)));
}

const observedEvents = [
  "request",
  "response",
  "requestfailed",
  "framenavigated",
  "domcontentloaded",
  "load",
  "close",
  "crash",
];

afterEach(() => {
  vi.mocked(info).mockClear();
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

test("correlates document events before and during goto and removes all listeners", async () => {
  const page = createPage();
  const request = () => ({
    isNavigationRequest: () => true,
    frame: () => page.mainFrame(),
    url: () => page.url(),
  });
  const beforeGoto = request();
  const duringGoto = request();
  await withAccountsPageDiagnostics(
    page as unknown as Page,
    "refresh_navigation",
    async (checkpoint, navigation) => {
      await checkpoint("navigation");
      page.emit("request", { isNavigationRequest: () => false });
      page.emit("request", { ...request(), frame: () => ({}) });
      page.emit("framenavigated", {});
      page.emit("request", beforeGoto);
      page.emit("response", {
        request: () => beforeGoto,
        status: () => 200,
        url: () => page.url(),
      });
      navigation("started");
      page.emit("request", duringGoto);
      page.emit("response", {
        request: () => duringGoto,
        status: () => 200,
        url: () => page.url(),
      });
      page.emit("framenavigated", page.mainFrame());
      page.emit("domcontentloaded");
      page.emit("load");
      navigation("completed");
    },
    { operationId: "test-operation", attempt: 1, maxAttempts: 2 },
  );
  const records = diagnosticRecords();
  expect(records.map((record) => record.event)).toEqual([
    "accounts_stage_started",
    "accounts_document_requested",
    "accounts_http_response",
    "accounts_goto_started",
    "accounts_document_requested",
    "accounts_http_response",
    "accounts_frame_navigated",
    "accounts_domcontentloaded",
    "accounts_load",
    "accounts_goto_completed",
    "accounts_page_done",
  ]);
  const requests = records.filter((record) => record.event === "accounts_document_requested");
  const responses = records.filter((record) => record.event === "accounts_http_response");
  expect(requests[0]).toMatchObject({ document_id: 1, navigation_state: "not_started" });
  expect(requests[1]).toMatchObject({ document_id: 2, navigation_state: "in_progress" });
  expect(responses.map((record) => record.document_id)).toEqual([1, 2]);
  expect(records.at(-1)).toMatchObject({ navigation_state: "completed" });
  for (const record of records)
    expect(record).toMatchObject({ operation_id: "test-operation", attempt: 1, max_attempts: 2 });
  expect(JSON.stringify(records)).not.toContain("secret-token");
  expect(JSON.stringify(records)).not.toContain("https://");
  for (const event of observedEvents) expect(page.listenerCount(event)).toBe(0);
});

test("keeps goto interruption separate from snapshot context destruction", async () => {
  const page = createPage();
  page.evaluate.mockRejectedValue(
    new Error("Execution context was destroyed, most likely because of a navigation"),
  );
  const failure = new Error(
    "Navigation to https://moneyforward.com/accounts?token=secret-token is interrupted by another navigation",
  );
  await expect(
    withAccountsPageDiagnostics(
      page as unknown as Page,
      "refresh_navigation",
      async (_, navigation) => {
        navigation("started");
        throw failure;
      },
    ),
  ).rejects.toBe(failure);
  const records = diagnosticRecords();
  expect(records.find((record) => record.event === "accounts_goto_failed")).toMatchObject({
    navigation_state: "failed",
    failure_kind: "navigation_interrupted",
  });
  expect(records.at(-1)).toMatchObject({
    event: "accounts_page_failed",
    failure_kind: "navigation_interrupted",
    snapshot_failure_kind: "execution_context_destroyed",
  });
  expect(JSON.stringify(records)).not.toContain("secret-token");
  for (const event of observedEvents) expect(page.listenerCount(event)).toBe(0);
});

test.each(["close", "crash"])(
  "records page %s without replacing the original failure",
  async (event) => {
    const page = createPage();
    const failure = new Error(
      event === "close" ? "Target page, context or browser has been closed" : "Page crashed",
    );
    await expect(
      withAccountsPageDiagnostics(
        page as unknown as Page,
        "refresh_navigation",
        async (_, navigation) => {
          navigation("started");
          if (event === "close") page.isClosed = () => true;
          page.emit(event);
          throw failure;
        },
      ),
    ).rejects.toBe(failure);
    const records = diagnosticRecords();
    expect(
      records.find(
        (record) =>
          record.event === (event === "close" ? "accounts_page_closed" : "accounts_page_crashed"),
      ),
    ).toMatchObject(event === "close" ? { page_closed: true } : { page_crashed: true });
    expect(records.at(-1)).toMatchObject({
      failure_kind: event === "close" ? "page_closed" : "page_crashed",
    });
    for (const name of observedEvents) expect(page.listenerCount(name)).toBe(0);
  },
);
