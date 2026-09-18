import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.fn<(path: string, type?: "layout" | "page") => void>();
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

const { POST } = await import("./route");

describe("POST /api/refresh/", () => {
  const originalRefreshToken = process.env.REFRESH_TOKEN;

  beforeEach(() => {
    revalidatePathMock.mockReset();
    delete process.env.REFRESH_TOKEN;
  });

  afterEach(() => {
    if (originalRefreshToken === undefined) {
      delete process.env.REFRESH_TOKEN;
    } else {
      process.env.REFRESH_TOKEN = originalRefreshToken;
    }
  });

  it("returns 503 when refresh token is not configured", async () => {
    const res = await POST(new Request("http://localhost/api/refresh/", { method: "POST" }));

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: "refresh disabled" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns 401 when authorization header is missing", async () => {
    process.env.REFRESH_TOKEN = "expected-token";

    const res = await POST(new Request("http://localhost/api/refresh/", { method: "POST" }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns 401 when bearer token is invalid", async () => {
    process.env.REFRESH_TOKEN = "expected-token";

    const res = await POST(
      new Request("http://localhost/api/refresh/", {
        method: "POST",
        headers: { authorization: "Bearer wrong-token" },
      }),
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("revalidates the layout and returns 200 when bearer token is valid", async () => {
    process.env.REFRESH_TOKEN = "expected-token";

    const res = await POST(
      new Request("http://localhost/api/refresh/", {
        method: "POST",
        headers: { authorization: "Bearer expected-token" },
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ revalidated: true });
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });
});
