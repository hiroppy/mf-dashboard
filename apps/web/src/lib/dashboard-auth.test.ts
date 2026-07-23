import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSessionToken,
  getSessionTtlSeconds,
  readSessionCookie,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "./dashboard-auth";

const originalEnv = { ...process.env };

describe("dashboard session", () => {
  beforeEach(() => {
    process.env = { ...originalEnv, DASHBOARD_SESSION_SECRET: "test-session-secret" };
    delete process.env.DEMO_MODE;
    delete process.env.DASHBOARD_SESSION_TTL_SECONDS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("accepts a signed session before its expiry", async () => {
    const now = Date.UTC(2026, 0, 1);
    const token = await createSessionToken(now);

    await expect(verifySessionToken(token ?? undefined, now + 1_000)).resolves.toBe(true);
  });

  it("rejects a session at its expiry boundary", async () => {
    const now = Date.UTC(2026, 0, 1);
    const token = await createSessionToken(now);

    await expect(
      verifySessionToken(token ?? undefined, now + getSessionTtlSeconds() * 1_000),
    ).resolves.toBe(false);
  });

  it("rejects missing configuration, malformed tokens, and modified signatures", async () => {
    const token = await createSessionToken();

    await expect(verifySessionToken(`${token}0`)).resolves.toBe(false);
    await expect(verifySessionToken("not-a-session")).resolves.toBe(false);
    delete process.env.DASHBOARD_SESSION_SECRET;
    await expect(verifySessionToken(token ?? undefined)).resolves.toBe(false);
  });

  it("uses the configured TTL only within the supported boundary", () => {
    process.env.DASHBOARD_SESSION_TTL_SECONDS = "300";
    expect(getSessionTtlSeconds()).toBe(300);

    process.env.DASHBOARD_SESSION_TTL_SECONDS = "299";
    expect(getSessionTtlSeconds()).toBe(43_200);

    process.env.DASHBOARD_SESSION_TTL_SECONDS = "604801";
    expect(getSessionTtlSeconds()).toBe(43_200);
  });

  it("reads the session from a cookie header", () => {
    expect(readSessionCookie(`theme=dark; ${SESSION_COOKIE_NAME}=signed-token; other=value`)).toBe(
      "signed-token",
    );
  });

  it("allows only explicitly marked demo builds to bypass authentication", async () => {
    delete process.env.DASHBOARD_SESSION_SECRET;
    process.env.DEMO_MODE = "true";

    await expect(verifySessionToken(undefined)).resolves.toBe(true);
  });
});
