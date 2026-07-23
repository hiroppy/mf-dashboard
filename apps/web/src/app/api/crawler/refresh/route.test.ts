import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, SESSION_COOKIE_NAME } from "../../../../lib/dashboard-auth";
import { GET, POST } from "./route";

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function authenticatedRequest(method: "GET" | "POST", headers: HeadersInit = {}) {
  const token = await createSessionToken();
  if (!token) throw new Error("test session secret is missing");

  const requestHeaders = new Headers({
    cookie: `${SESSION_COOKIE_NAME}=${token}`,
  });
  if (method === "POST") {
    requestHeaders.set("origin", "https://dashboard.example.com");
    requestHeaders.set("x-forwarded-host", "dashboard.example.com");
    requestHeaders.set("x-forwarded-proto", "https");
  }
  new Headers(headers).forEach((value, key) => requestHeaders.set(key, value));

  return new Request("http://web:8765/api/crawler/refresh/", {
    method,
    headers: requestHeaders,
  });
}

describe("/api/crawler/refresh/", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CRAWLER_URL: "http://crawler:8766",
      DASHBOARD_SESSION_SECRET: "test-session-secret",
    };
    delete process.env.DEMO_MODE;
    global.fetch = vi.fn<typeof fetch>();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  it("returns unavailable when crawler URL is not configured", async () => {
    delete process.env.CRAWLER_URL;

    const res = await GET(await authenticatedRequest("GET"));

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ available: false, running: false });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("proxies crawler status", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({ running: true, source: "manual", startedAt: "2026-01-01T00:00:00.000Z" }),
    );

    const res = await GET(await authenticatedRequest("GET"));

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
    expect(res.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  });

  it("starts a crawler run through the crawler service", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(jsonResponse({ running: true }, 202));

    const res = await POST(await authenticatedRequest("POST"));

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

    const res = await POST(await authenticatedRequest("POST"));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      available: true,
      running: true,
      source: "scheduled",
    });
  });

  it("rejects a crawler run from a cross-site origin", async () => {
    const res = await POST(
      await authenticatedRequest("POST", { origin: "https://attacker.example" }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Invalid origin" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects a crawler run without an origin header", async () => {
    const res = await POST(await authenticatedRequest("POST", { origin: "" }));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Invalid origin" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns unavailable when crawler service cannot be reached", async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error("connection refused"));

    const res = await GET(await authenticatedRequest("GET"));

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ available: false, running: false });
  });

  it("rejects an unauthenticated status request", async () => {
    const res = await GET(new Request("https://dashboard.example.com/api/crawler/refresh/"));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(res.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects an expired session", async () => {
    const issuedAt = Date.UTC(2026, 0, 1);
    const token = await createSessionToken(issuedAt);
    const res = await GET(
      new Request("https://dashboard.example.com/api/crawler/refresh/", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      }),
    );

    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects a tampered session", async () => {
    const token = await createSessionToken();
    const res = await GET(
      new Request("https://dashboard.example.com/api/crawler/refresh/", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}0` },
      }),
    );

    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
