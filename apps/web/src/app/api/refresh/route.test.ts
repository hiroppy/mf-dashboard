import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

const { POST } = await import("./route");

describe("POST /api/refresh", () => {
  beforeEach(() => {
    revalidatePathMock.mockReset();
  });

  it("revalidates the layout and returns 200", async () => {
    const res = await POST();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ revalidated: true });
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });
});
