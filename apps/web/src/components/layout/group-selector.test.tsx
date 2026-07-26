import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GroupSelector } from "./group-selector";

const { getAllGroupsMock, getCurrentGroupMock } = vi.hoisted(() => ({
  getAllGroupsMock: vi.fn<() => Promise<never[]>>(),
  getCurrentGroupMock: vi.fn<() => Promise<undefined>>(),
}));

vi.mock("@mf-dashboard/db", () => ({
  getAllGroups: getAllGroupsMock,
  getCurrentGroup: getCurrentGroupMock,
}));

vi.mock("./action-icons", () => ({
  RefreshStatus: ({ lastScrapedAt }: { lastScrapedAt: string | null }) => (
    <span data-testid="refresh-status">{lastScrapedAt ?? "更新日時なし"}</span>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GroupSelector", () => {
  it("keeps the refresh action available when no groups exist", async () => {
    getAllGroupsMock.mockResolvedValue([]);
    getCurrentGroupMock.mockResolvedValue(undefined);

    render(await GroupSelector());

    expect(screen.getByTestId("refresh-status").textContent).toBe("更新日時なし");
  });
});
