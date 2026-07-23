import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSessionToken, SESSION_COOKIE_NAME } from "./lib/dashboard-auth";
import { proxy } from "./proxy";

const originalEnv = { ...process.env };

describe("dashboard access proxy", () => {
  beforeEach(() => {
    process.env = { ...originalEnv, DASHBOARD_SESSION_SECRET: "test-session-secret" };
    delete process.env.DEMO_MODE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("redirects an unauthenticated dashboard request to login", async () => {
    const response = await proxy(new NextRequest("https://dashboard.example.com/accounts/"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://dashboard.example.com/login/");
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  });

  it("rejects an expired dashboard session", async () => {
    const token = await createSessionToken(Date.UTC(2026, 0, 1));
    const response = await proxy(
      new NextRequest("https://dashboard.example.com/", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://dashboard.example.com/login/");
  });

  it("allows a valid session and prevents shared caching", async () => {
    const token = await createSessionToken();
    const response = await proxy(
      new NextRequest("https://dashboard.example.com/", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("vary")).toContain("Cookie");
  });

  it("returns 401 instead of redirecting an unauthenticated API request", async () => {
    const response = await proxy(
      new NextRequest("https://dashboard.example.com/api/crawler/refresh/"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("bypasses viewer authentication only for demo mode", async () => {
    delete process.env.DASHBOARD_SESSION_SECRET;
    process.env.DEMO_MODE = "true";

    const response = await proxy(new NextRequest("https://dashboard.example.com/"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
