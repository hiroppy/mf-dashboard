import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readSessionCookie,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "../../../../lib/dashboard-auth";
import { POST } from "./route";

const originalEnv = { ...process.env };

function loginRequest(password: string, origin = "https://dashboard.example.com") {
  return new Request("https://dashboard.example.com/api/auth/login/", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin,
    },
    body: new URLSearchParams({ password }),
  });
}

describe("POST /api/auth/login/", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DASHBOARD_PASSWORD: "test-viewer-password",
      DASHBOARD_SESSION_SECRET: "test-session-secret",
      NODE_ENV: "test",
    };
    delete process.env.DEMO_MODE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("sets a signed HttpOnly session after a valid same-origin login", async () => {
    const response = await POST(loginRequest("test-viewer-password"));
    const setCookie = response.headers.get("set-cookie");
    const token = readSessionCookie(setCookie);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://dashboard.example.com/");
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).toContain("Path=/");
    await expect(verifySessionToken(token)).resolves.toBe(true);
  });

  it("does not issue a session for an invalid password", async () => {
    const response = await POST(loginRequest("wrong-password"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://dashboard.example.com/login/?error=invalid",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a login from an invalid origin", async () => {
    const response = await POST(loginRequest("test-viewer-password", "https://attacker.example"));

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("fails closed when the session secret is missing", async () => {
    delete process.env.DASHBOARD_SESSION_SECRET;

    const response = await POST(loginRequest("test-viewer-password"));

    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
