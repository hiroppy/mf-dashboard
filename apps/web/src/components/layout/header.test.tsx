import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Header } from "./header";
import { SidebarProvider } from "./sidebar-context";

const workflowUrl = "https://github.com/example/example/actions/workflows/daily-update.yml";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

afterEach(cleanup);

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
});
