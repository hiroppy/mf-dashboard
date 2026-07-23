import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unavailableCrawlerRefreshStatus } from "../../../../lib/crawler-refresh-status";
import { GET, POST } from "./route";

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sameOriginPostRequest(headers: HeadersInit = {}): Request {
  const requestHeaders = new Headers({
    origin: "https://dashboard.example.com",
    "x-forwarded-host": "dashboard.example.com",
    "x-forwarded-proto": "https",
  });
  new Headers(headers).forEach((value, key) => requestHeaders.set(key, value));

  return new Request("http://web:8765/api/crawler/refresh/", {
    method: "POST",
    headers: requestHeaders,
  });
}

function sameOriginGetRequest(headers: HeadersInit = {}): Request {
  const requestHeaders = new Headers({ "sec-fetch-site": "same-origin" });
  new Headers(headers).forEach((value, key) => requestHeaders.set(key, value));

  return new Request("https://dashboard.example.com/api/crawler/refresh/", {
    headers: requestHeaders,
  });
}

describe("/api/crawler/refresh/", () => {
  beforeEach(() => {
    process.env = { ...originalEnv, CRAWLER_URL: "http://crawler:8766" };
    global.fetch = vi.fn<typeof fetch>();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  it("returns unavailable when crawler URL is not configured", async () => {
    delete process.env.CRAWLER_URL;

    const res = await GET(sameOriginGetRequest());

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual(unavailableCrawlerRefreshStatus);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("proxies crawler status", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({ running: true, source: "manual", startedAt: "2026-01-01T00:00:00.000Z" }),
    );

    const res = await GET(sameOriginGetRequest());

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://crawler:8766/status",
      expect.objectContaining({ cache: "no-store" }),
    );
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({
        available: true,
        running: true,
        source: "manual",
        startedAt: "2026-01-01T00:00:00.000Z",
        latestRun: null,
      }),
    );
  });

  it("keeps an explicit stopped lock state over a stale running snapshot", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        running: false,
        version: 1,
        runId: "stale-run",
        runStatus: "running",
        source: "manual",
        startedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: null,
        current: null,
        waitingFor: null,
        progress: null,
        timeline: [],
        reason: null,
      }),
    );

    const res = await GET(sameOriginGetRequest());
    const body = await res.json();

    expect(body).toEqual(
      expect.objectContaining({
        available: true,
        running: false,
        latestRun: expect.objectContaining({ runStatus: "running" }),
      }),
    );
  });

  it("returns unavailable for a malformed successful crawler response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(jsonResponse({ error: "invalid status" }));

    const res = await GET(sameOriginGetRequest());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(unavailableCrawlerRefreshStatus);
  });

  it("drops a latest run snapshot with an invalid timestamp", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        running: false,
        version: 1,
        runId: "corrupt-run",
        runStatus: "failed",
        source: "manual",
        startedAt: "not-a-date",
        finishedAt: "also-not-a-date",
        current: null,
        waitingFor: null,
        progress: null,
        timeline: [],
        reason: { code: "unknown_error", message: "処理に失敗しました" },
      }),
    );

    const res = await GET(sameOriginGetRequest());

    await expect(res.json()).resolves.toEqual({
      available: true,
      running: false,
      source: "manual",
      startedAt: null,
      latestRun: null,
    });
  });

  it("proxies a typed latest run state", async () => {
    const latestRun = {
      version: 1,
      runId: "run-1",
      runStatus: "failed",
      source: "manual",
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:01:00.000Z",
      current: {
        timelineItemId: "refresh",
        label: "金融機関を更新",
        step: "moneyforward_refresh",
        metadata: {
          kind: "refresh",
          maxWaitMinutes: 0.5,
          remainingAccounts: 1,
          incompleteAccounts: ["機関 A"],
        },
      },
      waitingFor: null,
      progress: { completed: 2, total: 4 },
      timeline: [
        {
          id: "auth",
          label: "認証",
          step: "authentication",
          metadata: null,
          status: "done",
          startedAt: "2026-01-01T00:00:00.000Z",
          finishedAt: "2026-01-01T00:00:10.000Z",
          reason: null,
        },
        {
          id: "refresh",
          label: "金融機関を更新",
          step: "moneyforward_refresh",
          metadata: {
            kind: "refresh",
            maxWaitMinutes: 0.5,
            remainingAccounts: 1,
            incompleteAccounts: ["機関 A"],
          },
          status: "failed",
          startedAt: "2026-01-01T00:00:10.000Z",
          finishedAt: "2026-01-01T00:01:00.000Z",
          reason: {
            code: "moneyforward_timeout",
            message: "画面を開けませんでした",
            operation: "refresh",
            timeoutMs: 0.5,
          },
        },
      ],
      reason: {
        code: "moneyforward_timeout",
        message: "画面を開けませんでした",
        operation: "refresh",
        timeoutMs: 0.5,
      },
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        ...latestRun,
        running: false,
        pid: null,
      }),
    );

    const res = await GET(sameOriginGetRequest());

    await expect(res.json()).resolves.toEqual({
      available: true,
      running: false,
      source: "manual",
      startedAt: "2026-01-01T00:00:00.000Z",
      latestRun,
    });
  });

  it("proxies the latest successful run state", async () => {
    const latestRun = {
      version: 1,
      runId: "run-success",
      runStatus: "success",
      source: "manual",
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:01:00.000Z",
      current: null,
      waitingFor: null,
      progress: { completed: 1, total: 1 },
      timeline: [
        {
          id: "auth",
          label: "認証",
          step: "authentication",
          metadata: null,
          status: "done",
          startedAt: "2026-01-01T00:00:00.000Z",
          finishedAt: "2026-01-01T00:01:00.000Z",
          reason: null,
        },
      ],
      reason: null,
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(jsonResponse({ running: false, latestRun }));

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      available: true,
      running: false,
      source: "manual",
      startedAt: "2026-01-01T00:00:00.000Z",
      latestRun,
    });
  });

  it("starts a crawler run through the crawler service", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(jsonResponse({ running: true }, 202));

    const res = await POST(sameOriginPostRequest());

    expect(res.status).toBe(202);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://crawler:8766/runs",
      expect.objectContaining({ method: "POST", cache: "no-store" }),
    );
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({ available: true, running: true, latestRun: null }),
    );
  });

  it("preserves conflict response when crawler is already running", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({ running: true, source: "scheduled" }, 409),
    );

    const res = await POST(sameOriginPostRequest());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({
        available: true,
        running: true,
        source: "scheduled",
        latestRun: null,
      }),
    );
  });

  it("rejects a crawler run from a cross-site origin", async () => {
    const res = await POST(sameOriginPostRequest({ origin: "https://attacker.example" }));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Invalid origin" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects timeline status reads from a cross-site request", async () => {
    const res = await GET(
      new Request("https://dashboard.example.com/api/crawler/refresh/", {
        headers: { "sec-fetch-site": "cross-site" },
      }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Invalid origin" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects a crawler run without an origin header", async () => {
    const res = await POST(
      new Request("https://dashboard.example.com/api/crawler/refresh/", { method: "POST" }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Invalid origin" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns unavailable when crawler service cannot be reached", async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error("connection refused"));

    const res = await GET(sameOriginGetRequest());

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual(unavailableCrawlerRefreshStatus);
  });
});
