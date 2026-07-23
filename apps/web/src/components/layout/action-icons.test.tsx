import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDateTime } from "../../lib/format";
import { ActionIcons } from "./action-icons";

const originalEnv = { ...process.env };
const originalFetch = global.fetch;
const { refreshMock, routerMock } = vi.hoisted(() => {
  const refreshMock = vi.fn<() => void>();
  return {
    refreshMock,
    routerMock: { refresh: refreshMock },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  refreshMock.mockReset();
  global.fetch = vi
    .fn<typeof fetch>()
    .mockResolvedValue(jsonResponse({ available: true, running: false }));
});

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
});

describe("ActionIcons", () => {
  it("moves the repository link from the header into the help dialog", () => {
    render(<ActionIcons variant="header" />);

    expect(screen.queryByRole("link", { name: "GitHub リポジトリ" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "ヘルプ" }));

    const repositoryLink = screen.getByRole("link", { name: "GitHub リポジトリ" });
    const issuesLink = screen.getByRole("link", { name: "バグ報告・機能要望" });

    expect(repositoryLink.getAttribute("href")).toBe("https://github.com/hiroppy/mf-dashboard");
    expect(repositoryLink.querySelector("svg")).not.toBeNull();
    expect(repositoryLink.parentElement?.nextElementSibling?.contains(issuesLink)).toBe(true);
  });

  it("does not render a link to the removed daily update workflow", () => {
    process.env.NEXT_PUBLIC_GITHUB_ORG = "org-a";
    process.env.NEXT_PUBLIC_GITHUB_REPO = "repo-a";

    render(<ActionIcons variant="header" />);

    expect(screen.queryByLabelText("ワークフローを実行")).toBeNull();
  });

  it("starts a crawler refresh from the header refresh button", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(jsonResponse({ available: true, running: false }))
      .mockResolvedValueOnce(jsonResponse({ available: true, running: true }, 202));

    render(<ActionIcons variant="header" />);

    const refreshButton = screen.getByRole("button", { name: "金融機関データを更新" });
    await waitFor(() => expect((refreshButton as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(refreshButton);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/crawler/refresh/", { method: "POST" }),
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("resets terminal progress while optimistically starting another run", async () => {
    let resolveStart!: (response: Response) => void;
    const startResponse = new Promise<Response>((resolve) => {
      resolveStart = resolve;
    });
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          available: true,
          running: false,
          runStatus: "success",
          progress: { completed: 10, total: 10 },
        }),
      )
      .mockReturnValueOnce(startResponse);

    render(<ActionIcons variant="header" />);
    const refreshButton = screen.getByRole("button", { name: "金融機関データを更新" });
    await waitFor(() => expect((refreshButton as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(refreshButton);

    await waitFor(() => expect(screen.getByText("同期中 · 0/10")).not.toBeNull());
    resolveStart(
      jsonResponse({ available: true, running: true, progress: { completed: 0, total: 10 } }, 202),
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });

  it("refreshes the dashboard after the crawler run finishes", async () => {
    const intervalCallbacks: Array<() => unknown> = [];
    const setIntervalSpy = vi.spyOn(window, "setInterval").mockImplementation((handler) => {
      if (typeof handler === "function") {
        intervalCallbacks.push(handler as () => unknown);
      }
      return 1 as unknown as ReturnType<typeof window.setInterval>;
    });
    const clearIntervalSpy = vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);

    try {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(jsonResponse({ available: true, running: false }))
        .mockResolvedValueOnce(jsonResponse({ available: true, running: true }, 202))
        .mockResolvedValueOnce(jsonResponse({ available: true, running: false }));

      render(<ActionIcons variant="header" />);

      const refreshButton = screen.getByRole("button", { name: "金融機関データを更新" });
      await waitFor(() => expect((refreshButton as HTMLButtonElement).disabled).toBe(false));

      fireEvent.click(refreshButton);

      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith("/api/crawler/refresh/", { method: "POST" }),
      );
      expect(refreshMock).not.toHaveBeenCalled();

      await act(async () => {
        await intervalCallbacks[0]?.();
      });

      await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    } finally {
      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    }
  });

  it("disables the header refresh button while the crawler is running", async () => {
    const startedAt = "2026-01-01T00:00:00.000Z";
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({ available: true, running: true, source: "scheduled", startedAt }),
    );

    render(<ActionIcons variant="header" />);

    const refreshButton = screen.getByRole("button", { name: "金融機関データを更新" });
    await waitFor(() =>
      expect(refreshButton.getAttribute("title")).toBe(
        `更新中（開始: ${formatDateTime(startedAt)}）`,
      ),
    );
    expect((refreshButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(refreshButton);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("shows the current waiting reason while the crawler is running", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        available: true,
        running: true,
        runStatus: "running",
        current: {
          label: "金融機関データを一括更新",
          metadata: { remainingCount: 2 },
        },
        waitingFor: "更新中の金融機関が0件になるのを待機",
        progress: { completed: 3, total: 10 },
      }),
    );

    render(<ActionIcons variant="header" />);

    const refreshButton = screen.getByRole("button", { name: "金融機関データを更新" });
    await waitFor(() =>
      expect(refreshButton.getAttribute("title")).toBe(
        "更新中（更新中の金融機関が0件になるのを待機）",
      ),
    );
    expect(screen.getByText("同期中 · 3/10")).not.toBeNull();
  });

  it("shows the latest safe failure reason after the crawler stops", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        available: true,
        running: false,
        runStatus: "failed",
        reason: { code: "auth_failed", message: "処理中にエラーが発生しました" },
      }),
    );

    render(<ActionIcons variant="header" />);

    const refreshButton = screen.getByRole("button", { name: "金融機関データを更新" });
    await waitFor(() =>
      expect(refreshButton.getAttribute("title")).toBe(
        "前回の更新に失敗（処理中にエラーが発生しました）",
      ),
    );
  });

  it("disables the header refresh button when the crawler service is unavailable", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({ available: false, running: false }, 503),
    );

    render(<ActionIcons variant="header" />);

    const refreshButton = screen.getByRole("button", { name: "金融機関データを更新" });
    await waitFor(() => expect(refreshButton.getAttribute("title")).toBe("更新サービス未接続"));
    expect((refreshButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not render the refresh button in the mobile sidebar actions", () => {
    render(<ActionIcons variant="sidebar" />);

    expect(screen.queryByLabelText("金融機関データを更新")).toBeNull();
  });
});
