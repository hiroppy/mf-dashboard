import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

    const res = await GET();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ available: false, running: false });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("proxies crawler status", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({ running: true, source: "manual", startedAt: "2026-01-01T00:00:00.000Z" }),
    );

    const res = await GET();

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://crawler:8766/status",
      expect.objectContaining({ cache: "no-store" }),
    );
    await expect(res.json()).resolves.toEqual({
      available: true,
      running: true,
      source: "manual",
      startedAt: "2026-01-01T00:00:00.000Z",
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
    await expect(res.json()).resolves.toEqual({ available: true, running: true });
  });

  it("preserves conflict response when crawler is already running", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({ running: true, source: "scheduled" }, 409),
    );

    const res = await POST(sameOriginPostRequest());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      available: true,
      running: true,
      source: "scheduled",
    });
  });

  it("rejects a crawler run from a cross-site origin", async () => {
    const res = await POST(sameOriginPostRequest({ origin: "https://attacker.example" }));

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

    const res = await GET();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ available: false, running: false });
  });
});
