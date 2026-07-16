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
