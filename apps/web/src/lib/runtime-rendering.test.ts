import { afterEach, describe, expect, it, vi } from "vitest";

const connectionMock = vi.fn<() => Promise<void>>(() => Promise.resolve());

vi.mock("next/server", () => ({
  connection: connectionMock,
}));

const originalEnv = { ...process.env };
const { waitForRuntimeData } = await import("./runtime-rendering");

afterEach(() => {
  process.env = { ...originalEnv };
  connectionMock.mockClear();
});

describe("waitForRuntimeData", () => {
  it("waits for a runtime request outside demo export builds", async () => {
    delete process.env.DEMO_MODE;
    delete process.env.GITHUB_PAGES;

    await waitForRuntimeData();

    expect(connectionMock).toHaveBeenCalledTimes(1);
  });

  it("does not force runtime rendering for demo static export builds", async () => {
    process.env.DEMO_MODE = "true";
    process.env.GITHUB_PAGES = "true";

    await waitForRuntimeData();

    expect(connectionMock).not.toHaveBeenCalled();
  });
});
