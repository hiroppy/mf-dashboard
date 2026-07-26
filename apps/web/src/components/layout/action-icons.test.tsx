import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActionIcons, RefreshStatus } from "./action-icons";

const workflowUrl = "https://github.com/example/example/actions/workflows/daily-update.yml";

afterEach(cleanup);

describe("RefreshStatus", () => {
  it("shows the selected group's last update next to the refresh link", () => {
    render(<RefreshStatus lastScrapedAt="2025-04-30T01:30:00.000Z" workflowUrl={workflowUrl} />);

    expect(screen.getByText("4/30 10:30")).toBeTruthy();
    expect(
      screen
        .getByRole("link", {
          name: "データ更新ワークフローを開く（最終更新 4/30 10:30）",
        })
        .getAttribute("href"),
    ).toBe(workflowUrl);
  });

  it("keeps the refresh link available when no update time exists", () => {
    render(<RefreshStatus lastScrapedAt={null} workflowUrl={workflowUrl} />);

    expect(screen.getByRole("link", { name: "データ更新ワークフローを開く" })).toBeTruthy();
    expect(screen.queryByText("更新")).toBeNull();
  });

  it("renders nothing when neither update information nor a refresh link exists", () => {
    const { container } = render(<RefreshStatus lastScrapedAt={null} workflowUrl={null} />);

    expect(container.childElementCount).toBe(0);
  });
});

describe("ActionIcons", () => {
  it("places the update information before the other header actions", () => {
    render(
      <ActionIcons
        variant="header"
        lastScrapedAt="2025-04-30T01:30:00.000Z"
        refreshWorkflowUrl={workflowUrl}
        notifications={<button aria-label="通知">通知</button>}
      />,
    );

    const refreshLink = screen.getByRole("link", {
      name: "データ更新ワークフローを開く（最終更新 4/30 10:30）",
    });
    const actionGroup = refreshLink.parentElement?.parentElement;

    expect(actionGroup?.firstElementChild?.contains(refreshLink)).toBe(true);
    expect(refreshLink.compareDocumentPosition(screen.getByRole("button", { name: "通知" }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});
