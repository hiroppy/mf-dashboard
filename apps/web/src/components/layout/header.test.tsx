import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "./header";
import { SidebarProvider } from "./sidebar-context";

const { pathnameMock, refreshMock } = vi.hoisted(() => ({
  pathnameMock: vi.fn<() => string>(() => "/"),
  refreshMock: vi.fn<() => void>(),
}));
const groups = [
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
];

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
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Header", () => {
  it("keeps the refresh action available when no groups exist", () => {
    render(
      <SidebarProvider>
        <Header groups={[]} defaultGroupId={null} />
      </SidebarProvider>,
    );

    expect(screen.getByRole("button", { name: "更新サービス未接続" })).not.toBeNull();
  });

  it("shows the update time for the group selected by the URL", () => {
    pathnameMock.mockReturnValue("/group-b/");

    render(
      <SidebarProvider>
        <Header groups={groups} defaultGroupId="group-a" />
      </SidebarProvider>,
    );

    expect(screen.getByText("Group B")).not.toBeNull();
    expect(
      screen.getByText((_content, element) => element?.tagName === "TIME").getAttribute("datetime"),
    ).toBe("2025-04-30T15:20:00");
    expect(screen.getByRole("button", { name: "更新サービス未接続" })).not.toBeNull();
  });

  it("falls back to the default group when the URL group is unknown", () => {
    pathnameMock.mockReturnValue("/unknown-group/");

    render(
      <SidebarProvider>
        <Header groups={groups} defaultGroupId="group-a" />
      </SidebarProvider>,
    );

    expect(screen.getByText("Group A")).not.toBeNull();
    expect(
      screen.getByText((_content, element) => element?.tagName === "TIME").getAttribute("datetime"),
    ).toBe("2025-04-30T10:30:00");
    expect(screen.getByRole("button", { name: "更新サービス未接続" })).not.toBeNull();
  });

  it("uses the configured base path for the logo", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/dashboard");

    render(
      <SidebarProvider>
        <Header groups={[]} defaultGroupId={null} />
      </SidebarProvider>,
    );

    const imageUrl = new URL(
      screen.getByRole("img", { name: "Logo" }).getAttribute("src") ?? "",
      "http://localhost",
    );
    expect(imageUrl.searchParams.get("url")).toBe("/dashboard/logo.png");
  });
});
