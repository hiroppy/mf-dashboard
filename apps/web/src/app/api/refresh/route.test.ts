import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

const { POST } = await import("./route");

const buildRequest = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/refresh", { method: "POST", headers });

describe("POST /api/refresh", () => {
  const original = process.env.REFRESH_TOKEN;

  beforeEach(() => {
    revalidatePathMock.mockReset();
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.REFRESH_TOKEN;
    } else {
      process.env.REFRESH_TOKEN = original;
    }
  });

  it("returns 503 when REFRESH_TOKEN is not configured", async () => {
    delete process.env.REFRESH_TOKEN;

    const res = await POST(buildRequest({ authorization: "Bearer anything" }));

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: "refresh disabled" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns 401 when authorization header is missing or wrong", async () => {
    process.env.REFRESH_TOKEN = "secret";

    const missing = await POST(buildRequest());
    expect(missing.status).toBe(401);
    await expect(missing.json()).resolves.toEqual({ error: "unauthorized" });

    const wrong = await POST(buildRequest({ authorization: "Bearer nope" }));
    expect(wrong.status).toBe(401);
    await expect(wrong.json()).resolves.toEqual({ error: "unauthorized" });

    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("revalidates the layout and returns 200 when bearer token matches", async () => {
    process.env.REFRESH_TOKEN = "secret";

    const res = await POST(buildRequest({ authorization: "Bearer secret" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ revalidated: true });
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });
});
