import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "./header";
import { SidebarProvider } from "./sidebar-context";

const workflowUrl = "https://github.com/example/example/actions/workflows/daily-update.yml";
const { pathnameMock, refreshMock } = vi.hoisted(() => ({
  pathnameMock: vi.fn<() => string>(() => "/"),
  refreshMock: vi.fn<() => void>(),
}));

vi.mock("next/navigation", () => ({
  usePathname: pathnameMock,
  useRouter: () => ({ refresh: refreshMock }),
}));

class EventSourceMock {
  close() {}
}

beforeEach(() => {
  pathnameMock.mockReturnValue("/");
  vi.stubGlobal("EventSource", EventSourceMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Header", () => {
  it("keeps the refresh action available when no groups exist", () => {
    render(
      <SidebarProvider>
        <Header groups={[]} defaultGroupId={null} refreshWorkflowUrl={workflowUrl} />
      </SidebarProvider>,
    );

    expect(
      screen.getByRole("link", { name: "データ更新ワークフローを開く" }).getAttribute("href"),
    ).toBe(workflowUrl);
  });

  it("shows the update time for the group selected by the URL", () => {
    pathnameMock.mockReturnValue("/group-b/");

    render(
      <SidebarProvider>
        <Header
          groups={[
            {
              id: "group-a",
              name: "Group A",
              isCurrent: true,
              lastScrapedAt: "2025-04-30T10:30:00",
            },
            {
              id: "group-b",
              name: "Group B",
              isCurrent: false,
              lastScrapedAt: "2025-04-30T15:20:00",
            },
          ]}
          defaultGroupId="group-a"
          refreshWorkflowUrl={workflowUrl}
        />
      </SidebarProvider>,
    );

    expect(screen.getByText("Group B")).not.toBeNull();
    expect(
      screen.getByRole("link", {
        name: "データ更新ワークフローを開く（最終更新 4/30 15:20）",
      }),
    ).not.toBeNull();
  });
});
