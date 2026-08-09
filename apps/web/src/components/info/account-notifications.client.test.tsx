import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountNotificationsClient } from "./account-notifications.client";
import { BANK_FORECAST_ANCHOR_CHANGE_EVENT } from "./bank-cashflow-forecast-anchor";

const initialUrl = window.location.href;
const anchorChangeListener = vi.fn<() => void>();

beforeEach(() => {
  anchorChangeListener.mockClear();
  window.addEventListener(BANK_FORECAST_ANCHOR_CHANGE_EVENT, anchorChangeListener);
});

afterEach(() => {
  window.removeEventListener(BANK_FORECAST_ANCHOR_CHANGE_EVENT, anchorChangeListener);
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", initialUrl);
});

describe("AccountNotificationsClient", () => {
  it("残高通知の選択後に同一ページの予想カードへアンカー変更を通知する", async () => {
    window.history.replaceState(null, "", "/cf/");
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");
    render(
      <AccountNotificationsClient
        errorAccounts={[]}
        updatingAccounts={[]}
        balanceAlerts={[{ accountId: 1, accountName: "銀行 A", forecastBalance: -10_000 }]}
        totalIssues={1}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "通知 1件" }));
    const alertLink = await screen.findByRole("link", { name: /銀行 A/ });
    fireEvent.click(alertLink);

    await waitFor(() => expect(screen.queryByRole("link", { name: /銀行 A/ })).toBeNull());
    await waitFor(() => expect(anchorChangeListener).toHaveBeenCalledOnce());
    expect(window.location.hash).toBe("#bank-forecast-account-1");
    expect(replaceState).toHaveBeenCalledOnce();
    expect(pushState).not.toHaveBeenCalled();
  });

  it.each(["metaKey", "ctrlKey", "shiftKey", "altKey"] as const)(
    "%s 付きクリックは標準のリンク操作を維持する",
    async (modifierKey) => {
      window.history.replaceState(null, "", "/cf/");
      render(
        <AccountNotificationsClient
          errorAccounts={[]}
          updatingAccounts={[]}
          balanceAlerts={[{ accountId: 1, accountName: "銀行 A", forecastBalance: -10_000 }]}
          totalIssues={1}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "通知 1件" }));
      const alertLink = await screen.findByRole("link", { name: /銀行 A/ });
      let defaultPreventedByComponent = false;
      const suppressBrowserNavigation = (event: MouseEvent) => {
        defaultPreventedByComponent = event.defaultPrevented;
        event.preventDefault();
      };
      window.addEventListener("click", suppressBrowserNavigation, { once: true });

      try {
        fireEvent.click(alertLink, { [modifierKey]: true });
        expect(defaultPreventedByComponent).toBe(false);
        expect(anchorChangeListener).not.toHaveBeenCalled();
        expect(window.location.hash).toBe("");
        expect(screen.getByRole("link", { name: /銀行 A/ })).toBeTruthy();
      } finally {
        window.removeEventListener("click", suppressBrowserNavigation);
      }
    },
  );
});
