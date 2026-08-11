import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionIcons } from "./action-icons";

const originalEnv = { ...process.env };
const originalFetch = global.fetch;
const originalEventSource = global.EventSource;
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

class EventSourceMock {
  static instances: EventSourceMock[] = [];
  readonly url: string;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  close = vi.fn<() => void>();

  constructor(url: string | URL) {
    this.url = String(url);
    EventSourceMock.instances.push(this);
  }

  emit(body: unknown) {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(body) }));
  }
}

async function emitStatus(body: unknown): Promise<void> {
  await act(async () => {
    EventSourceMock.instances.at(-1)?.emit(body);
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

const successfulLatestRun = {
  version: 1,
  runId: "run-success",
  runStatus: "success",
  source: "manual",
  startedAt: "2026-01-01T00:00:00.000Z",
  finishedAt: "2026-01-01T00:00:10.000Z",
  current: null,
  progress: { completed: 0, total: 0 },
  timeline: [],
  reason: null,
};

beforeEach(() => {
  refreshMock.mockReset();
  EventSourceMock.instances = [];
  global.EventSource = EventSourceMock as unknown as typeof EventSource;
  global.fetch = vi
    .fn<typeof fetch>()
    .mockResolvedValue(jsonResponse({ available: true, running: false }));
});

afterEach(() => {
  process.env = { ...originalEnv };
  global.EventSource = originalEventSource;
  global.fetch = originalFetch;
});

describe("ActionIcons", () => {
  it("shows only the last updated date and time without a divider or label", () => {
    const { container } = render(
      <ActionIcons variant="header" lastScrapedAt="2025-04-30T10:30:00" />,
    );

    const time = screen.getByText("4/30 10:30");
    expect(time.tagName).toBe("TIME");
    expect(time.getAttribute("datetime")).toBe("2025-04-30T10:30:00");
    expect(time.closest(".border-l")).toBeNull();
    expect(screen.queryByText("更新")).toBeNull();
    expect(container.querySelectorAll("time")).toHaveLength(1);
  });

  it("does not show the last updated area when no date is available", () => {
    const { container } = render(<ActionIcons variant="header" lastScrapedAt={null} />);

    expect(container.querySelector("time")).toBeNull();
  });

  it("describes the in-app AI assistant in the help dialog", () => {
    render(<ActionIcons variant="header" />);

    fireEvent.click(screen.getByRole("button", { name: "ヘルプ" }));

    expect(screen.getByText("AI アシスタント")).not.toBeNull();
    expect(
      screen.getByText("Webアプリ内で家計・資産・投資データを自然言語で照会できます。"),
    ).not.toBeNull();
    expect(screen.queryByText("MCP 連携")).toBeNull();
  });

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

  it("does not show the updating state while loading the initial status", async () => {
    const { unmount } = render(<ActionIcons variant="header" />);

    const refreshButton = screen.getByRole("button", { name: "更新サービス未接続" });
    expect(refreshButton.querySelector("svg")?.getAttribute("class")).not.toContain("animate-spin");
    const events = EventSourceMock.instances.at(-1);
    expect(events?.url).toBe("/api/crawler/refresh/");

    unmount();
    expect(events?.close).toHaveBeenCalledTimes(1);
  });

  it("uses the configured base path for crawler requests", async () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "/dashboard";
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({ available: true, running: true }, 202),
    );

    render(<ActionIcons variant="header" />);
    expect(EventSourceMock.instances.at(-1)?.url).toBe("/dashboard/api/crawler/refresh/");
    await emitStatus({ running: false });

    fireEvent.click(await screen.findByRole("button", { name: "金融機関データを更新" }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/dashboard/api/crawler/refresh/", {
        method: "POST",
      }),
    );
  });

  it("starts a crawler refresh from the header refresh button", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({ available: true, running: true }, 202),
    );

    render(<ActionIcons variant="header" />);
    await emitStatus({ running: false });

    const refreshButton = await screen.findByRole("button", { name: "金融機関データを更新" });
    expect((refreshButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(refreshButton);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/crawler/refresh/", { method: "POST" }),
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("applies a terminal status received while starting a refresh", async () => {
    let resolvePost: ((response: Response) => void) | undefined;
    vi.mocked(global.fetch).mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolvePost = resolve;
      }),
    );
    render(<ActionIcons variant="header" />);
    await emitStatus({ running: false });

    fireEvent.click(screen.getByRole("button", { name: "金融機関データを更新" }));
    await emitStatus({ running: false, latestRun: successfulLatestRun });

    expect(screen.getByRole("button", { name: "同期タイムラインを表示" })).toBeTruthy();

    await act(async () => {
      resolvePost?.(jsonResponse({ available: true, running: true }, 202));
    });

    expect(await screen.findByRole("button", { name: "金融機関データを更新" })).toBeTruthy();
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("does not let a stale idle status override a confirmed running POST response", async () => {
    let resolvePost: ((response: Response) => void) | undefined;
    vi.mocked(global.fetch).mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolvePost = resolve;
      }),
    );
    render(<ActionIcons variant="header" />);
    await emitStatus({ running: false });

    fireEvent.click(screen.getByRole("button", { name: "金融機関データを更新" }));
    await emitStatus({ running: false });

    await act(async () => {
      resolvePost?.(jsonResponse({ available: true, running: true }, 202));
    });

    expect(screen.getByRole("button", { name: "同期タイムラインを表示" })).toBeTruthy();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("refreshes after an ambiguous POST failure is reconciled by SSE", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({ error: "upstream response lost" }, 503),
    );
    render(<ActionIcons variant="header" />);
    await emitStatus({ running: false });

    fireEvent.click(screen.getByRole("button", { name: "金融機関データを更新" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/crawler/refresh/", { method: "POST" }),
    );
    // Under full-suite load, React may commit the failed POST recovery after the fetch resolves.
    // Wait for that recovery before sending the SSE event that reconciles the ambiguous request.
    expect(await screen.findByRole("button", { name: "金融機関データを更新" })).toBeTruthy();

    await emitStatus({ running: false });

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "金融機関データを更新" })).toBeTruthy();
  });

  it("preserves buffered running and terminal statuses when the refresh POST fails", async () => {
    let resolvePost: ((response: Response) => void) | undefined;
    vi.mocked(global.fetch).mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolvePost = resolve;
      }),
    );
    render(<ActionIcons variant="header" />);
    await emitStatus({ running: false });

    fireEvent.click(screen.getByRole("button", { name: "金融機関データを更新" }));
    await emitStatus({ running: true });
    await emitStatus({ running: false });

    await act(async () => {
      resolvePost?.(jsonResponse({ error: "upstream response lost" }, 503));
    });

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "金融機関データを更新" })).toBeTruthy();
  });

  it("starts another refresh after the latest run succeeded", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({ available: true, running: true }, 202),
    );

    render(<ActionIcons variant="header" />);
    await emitStatus({
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
    });

    const refreshButton = await screen.findByRole("button", { name: "金融機関データを更新" });
    fireEvent.click(refreshButton);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/crawler/refresh/", { method: "POST" }),
    );
    expect(screen.queryByText("同期失敗")).toBeNull();
  });

  it("refreshes the dashboard after the crawler run finishes", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({ available: true, running: true }, 202),
    );
    render(<ActionIcons variant="header" />);
    await emitStatus({ running: false });

    fireEvent.click(screen.getByRole("button", { name: "金融機関データを更新" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/crawler/refresh/", { method: "POST" }),
    );

    await emitStatus({ running: false });

    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes the dashboard when a crawler run fails after partial updates", async () => {
    render(<ActionIcons variant="header" />);
    await emitStatus({ running: true });
    await emitStatus({ running: false, latestRun: failedLatestRun });

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "同期失敗の詳細を表示" })).toBeTruthy();
  });

  it("opens the latest running timeline without starting another refresh", async () => {
    const startedAt = "2026-01-01T00:00:00.000Z";
    const status = {
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
    };

    render(<ActionIcons variant="header" />);
    await emitStatus(status);

    const refreshButton = await screen.findByRole("button", { name: "同期タイムラインを表示" });
    expect((refreshButton as HTMLButtonElement).disabled).toBe(false);
    expect(refreshButton.querySelector("svg")?.getAttribute("class")).toContain(
      "animate-spin text-primary/90",
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
    expect(global.fetch).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("ignores a stale failed snapshot while a new run is active", async () => {
    render(<ActionIcons variant="header" />);
    await emitStatus({ running: true, latestRun: failedLatestRun });

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
    vi.mocked(global.fetch).mockReturnValueOnce(postResponse);

    render(<ActionIcons variant="header" />);
    await emitStatus({ running: false });

    fireEvent.click(await screen.findByRole("button", { name: "金融機関データを更新" }));

    expect(await screen.findByRole("button", { name: "同期タイムラインを表示" })).toBeTruthy();

    await act(async () => {
      resolvePost?.(jsonResponse({ available: true, running: true }, 202));
      await postResponse;
    });
  });

  it("opens a failed timeline and retries from the popover", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({ available: true, running: true }, 202),
    );

    render(<ActionIcons variant="header" />);
    await emitStatus({ running: false, latestRun: failedLatestRun });

    const refreshButton = await screen.findByRole("button", { name: "同期失敗の詳細を表示" });
    expect((refreshButton as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("同期失敗")).toBeNull();

    fireEvent.click(refreshButton);

    expect(await screen.findByRole("heading", { name: "同期に失敗しました" })).toBeTruthy();
    expect(screen.getByText(/開始 .+ \(00:10\)/)).toBeTruthy();
    expect(screen.getByText("失敗").className).toContain("font-semibold text-destructive");
    expect(screen.getAllByText("認証できませんでした")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "再度更新" }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/crawler/refresh/", { method: "POST" }),
    );
  });

  it("disables the header refresh button when the crawler service is unavailable", async () => {
    render(<ActionIcons variant="header" />);
    await act(async () => {
      EventSourceMock.instances.at(-1)?.onerror?.(new Event("error"));
    });

    const refreshButton = await screen.findByRole("button", { name: "更新サービス未接続" });
    expect(refreshButton.getAttribute("title")).toBe("更新サービス未接続");
    expect((refreshButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("refreshes after reconnecting when a running crawl finished during an SSE outage", async () => {
    render(<ActionIcons variant="header" />);
    await emitStatus({ running: true });

    await act(async () => {
      EventSourceMock.instances.at(-1)?.onerror?.(new Event("error"));
    });
    await emitStatus({ running: false });

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "金融機関データを更新" })).toBeTruthy();
  });

  it("recovers after an unavailable SSE handshake event", async () => {
    render(<ActionIcons variant="header" />);
    await emitStatus({ running: false, available: false });

    expect(screen.getByRole("button", { name: "更新サービス未接続" })).toBeTruthy();

    await emitStatus({ running: false });

    expect(screen.getByRole("button", { name: "金融機関データを更新" })).toBeTruthy();
  });

  it("does not render the refresh button in the mobile sidebar actions", () => {
    render(<ActionIcons variant="sidebar" />);

    expect(screen.queryByLabelText("金融機関データを更新")).toBeNull();
  });
});
