import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unavailableCrawlerRefreshStatus } from "../../../../lib/crawler-refresh-status";
import { GET, POST } from "./route";

const mocks = vi.hoisted(() => ({
  hasValidCloudflareAccess: vi.fn<(request: Request) => Promise<boolean>>(),
}));

vi.mock("../../../../lib/cloudflare-access", () => ({
  hasValidCloudflareAccess: mocks.hasValidCloudflareAccess,
}));

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function eventStreamResponse(body: unknown): Response {
  return new Response(`data: ${JSON.stringify(body)}\n\n`, {
    headers: { "content-type": "text/event-stream" },
  });
}

const unavailableEvent = `data: ${JSON.stringify(unavailableCrawlerRefreshStatus)}\n\n`;

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
    process.env = {
      ...originalEnv,
      CRAWLER_URL: "http://crawler:8766",
      REFRESH_TOKEN: "refresh-token",
    };
    global.fetch = vi.fn<typeof fetch>();
    mocks.hasValidCloudflareAccess.mockResolvedValue(true);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  it("returns unavailable when crawler URL is not configured", async () => {
    delete process.env.CRAWLER_URL;

    const res = await GET(sameOriginGetRequest());

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    await expect(res.text()).resolves.toBe(unavailableEvent);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("proxies crawler events as an SSE stream", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      eventStreamResponse({ running: true, source: "manual" }),
    );

    const res = await GET(sameOriginGetRequest());

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://crawler:8766/events",
      expect.objectContaining({
        cache: "no-store",
        headers: {
          accept: "text/event-stream",
          authorization: "Bearer refresh-token",
        },
      }),
    );
    await expect(res.text()).resolves.toBe(
      `data: ${JSON.stringify({ running: true, source: "manual" })}\n\n`,
    );
  });

  it("returns unavailable when the crawler event stream fails", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(jsonResponse({ error: "failed" }, 500));

    const res = await GET(sameOriginGetRequest());

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    await expect(res.text()).resolves.toBe(unavailableEvent);
  });

  it("starts a crawler run through the crawler service", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(jsonResponse({ running: true }, 202));

    const res = await POST(sameOriginPostRequest());

    expect(res.status).toBe(202);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://crawler:8766/runs",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        headers: expect.any(Headers),
      }),
    );
    const requestInit = vi.mocked(global.fetch).mock.calls[0]?.[1];
    expect(new Headers(requestInit?.headers).get("authorization")).toBe("Bearer refresh-token");
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({ available: true, running: true, latestRun: null }),
    );
  });

  it("rejects an unauthenticated crawler run", async () => {
    mocks.hasValidCloudflareAccess.mockResolvedValue(false);

    const res = await POST(sameOriginPostRequest());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(global.fetch).not.toHaveBeenCalled();
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

  it("rejects event streams from a cross-site request", async () => {
    const res = await GET(
      new Request("https://dashboard.example.com/api/crawler/refresh/", {
        headers: { "sec-fetch-site": "cross-site" },
      }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Invalid origin" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated event stream", async () => {
    mocks.hasValidCloudflareAccess.mockResolvedValue(false);

    const res = await GET(sameOriginGetRequest());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
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

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    await expect(res.text()).resolves.toBe(unavailableEvent);
  });

  it("times out when the crawler does not complete the SSE handshake", async () => {
    vi.useFakeTimers();
    vi.mocked(global.fetch).mockImplementationOnce(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    try {
      const responsePromise = GET(sameOriginGetRequest());
      await vi.advanceTimersByTimeAsync(5_000);
      const res = await responsePromise;

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/event-stream");
      await expect(res.text()).resolves.toBe(unavailableEvent);
    } finally {
      vi.useRealTimers();
    }
  });
});
