import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const failedLatestRun = {
  version: 1,
  runId: "run-failed",
  runStatus: "failed",
  source: "manual",
  startedAt: "2026-01-01T00:00:00.000Z",
  finishedAt: "2026-01-01T00:00:10.000Z",
  current: {
    timelineItemId: "auth",
    label: "認証",
    step: "authentication",
    metadata: null,
  },
  progress: null,
  timeline: [
    {
      id: "auth",
      label: "認証",
      step: "authentication",
      metadata: null,
      status: "failed",
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:10.000Z",
      reason: { code: "auth_failed", message: "認証できませんでした" },
    },
  ],
  reason: { code: "auth_failed", message: "認証できませんでした" },
};

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

    const refreshButton = await screen.findByRole("button", { name: "金融機関データを更新" });
    expect((refreshButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(refreshButton);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/crawler/refresh/", { method: "POST" }),
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("starts another refresh after the latest run succeeded", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          available: true,
          running: false,
          latestRun: {
            version: 1,
            runId: "run-success",
            runStatus: "success",
            source: "manual",
            startedAt: "2026-01-01T00:00:00.000Z",
            finishedAt: "2026-01-01T00:01:00.000Z",
            current: null,
            progress: { completed: 5, total: 5 },
            timeline: [],
            reason: null,
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ available: true, running: true }, 202));

    render(<ActionIcons variant="header" />);

    const refreshButton = await screen.findByRole("button", { name: "金融機関データを更新" });
    fireEvent.click(refreshButton);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/crawler/refresh/", { method: "POST" }),
    );
    expect(screen.queryByText("同期失敗")).toBeNull();
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

      const refreshButton = await screen.findByRole("button", {
        name: "金融機関データを更新",
      });
      expect((refreshButton as HTMLButtonElement).disabled).toBe(false);

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

  it("refreshes the dashboard when a crawler run fails after partial updates", async () => {
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
        .mockResolvedValueOnce(jsonResponse({ available: true, running: true }))
        .mockResolvedValueOnce(
          jsonResponse({ available: true, running: false, latestRun: failedLatestRun }),
        );

      render(<ActionIcons variant="header" />);
      await screen.findByRole("button", { name: "同期タイムラインを表示" });

      await act(async () => {
        await intervalCallbacks[0]?.();
      });

      await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
      expect(screen.getByRole("button", { name: "同期失敗の詳細を表示" })).toBeTruthy();
    } finally {
      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    }
  });

  it("opens the latest running timeline without starting another refresh", async () => {
    const startedAt = "2026-01-01T00:00:00.000Z";
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        available: true,
        running: true,
        source: "scheduled",
        startedAt,
        latestRun: {
          version: 1,
          runId: "run-1",
          runStatus: "running",
          source: "scheduled",
          startedAt,
          finishedAt: null,
          progress: { completed: 2, total: 5 },
          current: {
            timelineItemId: "refresh",
            label: "金融機関データを一括更新",
            step: "moneyforward_refresh",
            metadata: {
              kind: "refresh",
              maxWaitMinutes: 10,
              remainingAccounts: 1,
              incompleteAccounts: ["金融機関 A"],
            },
          },
          timeline: [
            {
              id: "auth",
              label: "認証",
              step: "authentication",
              metadata: null,
              status: "done",
              startedAt,
              finishedAt: "2026-01-01T00:00:10.000Z",
              reason: null,
            },
            {
              id: "accounts",
              label: "登録口座を取得",
              step: "registered_accounts",
              metadata: null,
              status: "running",
              startedAt: "2026-01-01T00:00:10.000Z",
              finishedAt: null,
              reason: null,
            },
            {
              id: "refresh",
              label: "金融機関データを一括更新",
              step: "moneyforward_refresh",
              metadata: {
                kind: "refresh",
                maxWaitMinutes: 10,
                remainingAccounts: 1,
                incompleteAccounts: ["金融機関 A"],
              },
              status: "running",
              startedAt: "2026-01-01T00:00:10.000Z",
              finishedAt: null,
              reason: null,
            },
          ],
          reason: null,
        },
      }),
    );

    render(<ActionIcons variant="header" />);

    const refreshButton = await screen.findByRole("button", { name: "同期タイムラインを表示" });
    expect((refreshButton as HTMLButtonElement).disabled).toBe(false);
    expect(refreshButton.querySelector("svg")?.getAttribute("class")).toContain(
      "animate-spin text-primary",
    );
    expect(screen.queryByText("同期中 · 2/5")).toBeNull();

    fireEvent.click(refreshButton);

    const timelineDialog = await screen.findByRole("dialog", { name: "同期タイムライン" });
    expect(timelineDialog.className).toContain("h-[min(32rem,calc(100dvh-2rem))]");
    expect(screen.queryByRole("heading", { name: "同期タイムライン" })).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getAllByText("実行中")).toHaveLength(1);
    expect(screen.getByText("金融機関データを一括更新").closest("li")?.className).toContain(
      "bg-muted/40",
    );
    expect(screen.getByText("完了").className).toContain("font-semibold text-success");
    const accountsStep = screen.getByText("登録口座を取得").closest("li");
    expect(accountsStep?.textContent).not.toContain("実行中");
    expect(screen.getByText("残り 1件: 金融機関 A")).toBeTruthy();
    const authenticationStep = screen.getByText("認証").closest("li");
    expect(accountsStep).not.toBeNull();
    expect(authenticationStep).not.toBeNull();
    expect(
      accountsStep!.compareDocumentPosition(authenticationStep!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("ignores a stale failed snapshot while a new run is active", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        available: true,
        running: true,
        latestRun: failedLatestRun,
      }),
    );

    render(<ActionIcons variant="header" />);

    const refreshButton = await screen.findByRole("button", { name: "同期タイムラインを表示" });
    expect(screen.queryByText("同期失敗")).toBeNull();

    fireEvent.click(refreshButton);

    expect(await screen.findByText("タイムラインはまだありません。")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "同期タイムライン" })).toBeNull();
    expect(screen.queryByRole("button", { name: "再度更新" })).toBeNull();
  });

  it("shows baseline progress immediately after starting a refresh", async () => {
    let resolvePost: ((response: Response) => void) | undefined;
    const postResponse = new Promise<Response>((resolve) => {
      resolvePost = resolve;
    });
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(jsonResponse({ available: true, running: false }))
      .mockReturnValueOnce(postResponse);

    render(<ActionIcons variant="header" />);

    fireEvent.click(await screen.findByRole("button", { name: "金融機関データを更新" }));

    expect(await screen.findByRole("button", { name: "同期タイムラインを表示" })).toBeTruthy();

    await act(async () => {
      resolvePost?.(jsonResponse({ available: true, running: true }, 202));
      await postResponse;
    });
  });

  it("opens a failed timeline and retries from the popover", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          available: true,
          running: false,
          latestRun: failedLatestRun,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ available: true, running: true }, 202));

    render(<ActionIcons variant="header" />);

    const refreshButton = await screen.findByRole("button", { name: "同期失敗の詳細を表示" });
    expect((refreshButton as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("同期失敗")).toBeNull();

    fireEvent.click(refreshButton);

    expect(await screen.findByRole("heading", { name: "同期に失敗しました" })).toBeTruthy();
    expect(screen.getByText(/開始 .+ \(00:10\)/)).toBeTruthy();
    expect(screen.getByText("失敗").className).toContain("font-semibold text-destructive");
    expect(screen.getAllByText("認証できませんでした")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "再度更新" }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/crawler/refresh/", { method: "POST" }),
    );
  });

  it("disables the header refresh button when the crawler service is unavailable", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({ available: false, running: false }, 503),
    );

    render(<ActionIcons variant="header" />);

    const refreshButton = await screen.findByRole("button", { name: "更新サービス未接続" });
    expect(refreshButton.getAttribute("title")).toBe("更新サービス未接続");
    expect((refreshButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not render the refresh button in the mobile sidebar actions", () => {
    render(<ActionIcons variant="sidebar" />);

    expect(screen.queryByLabelText("金融機関データを更新")).toBeNull();
  });
});
