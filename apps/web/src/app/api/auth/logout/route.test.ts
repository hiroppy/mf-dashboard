import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../../../../lib/dashboard-auth";
import { POST } from "./route";

describe("POST /api/auth/logout/", () => {
  it("clears the session for a same-origin request", async () => {
    const response = await POST(
      new Request("https://dashboard.example.com/api/auth/logout/", {
        method: "POST",
        headers: { origin: "https://dashboard.example.com" },
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://dashboard.example.com/login/");
    expect(response.headers.get("set-cookie")).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("rejects a cross-origin logout", async () => {
    const response = await POST(
      new Request("https://dashboard.example.com/api/auth/logout/", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
