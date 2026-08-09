import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountNotificationsClient } from "./account-notifications.client";
import { BANK_FORECAST_ANCHOR_CHANGE_EVENT } from "./bank-cashflow-forecast-anchor";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AccountNotificationsClient", () => {
  it("残高通知の選択後に同一ページの予想カードへアンカー変更を通知する", async () => {
    window.history.replaceState(null, "", "/cf/");
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const anchorChangeListener = vi.fn<() => void>();
    window.addEventListener(BANK_FORECAST_ANCHOR_CHANGE_EVENT, anchorChangeListener);
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
    window.removeEventListener(BANK_FORECAST_ANCHOR_CHANGE_EVENT, anchorChangeListener);
  });

  it("修飾キー付きクリックは標準のリンク操作を維持する", async () => {
    window.history.replaceState(null, "", "/cf/");
    const anchorChangeListener = vi.fn<() => void>();
    window.addEventListener(BANK_FORECAST_ANCHOR_CHANGE_EVENT, anchorChangeListener);
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
    alertLink.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(alertLink, { metaKey: true });

    expect(anchorChangeListener).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
    expect(screen.getByRole("link", { name: /銀行 A/ })).toBeTruthy();
    window.removeEventListener(BANK_FORECAST_ANCHOR_CHANGE_EVENT, anchorChangeListener);
  });
});
