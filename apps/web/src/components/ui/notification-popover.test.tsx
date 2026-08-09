import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationPopover } from "./notification-popover";

afterEach(cleanup);

describe("NotificationPopover", () => {
  it("残高注意を更新ステータスとは別のセクションに表示する", () => {
    const onNavigate = vi.fn<() => void>();
    render(
      <NotificationPopover
        errorAccounts={[{ id: 1, mfId: "account-1", name: "銀行 A", status: "error" }]}
        updatingAccounts={[]}
        balanceAlerts={[{ accountId: 2, accountName: "銀行 B", forecastBalance: -60_000 }]}
        onNavigate={onNavigate}
      />,
    );

    const balanceSection = screen.getByRole("region", { name: "残高注意" });
    const statusSection = screen.getByRole("region", { name: "更新ステータス" });
    expect(balanceSection.parentElement?.className).toContain("max-h-[calc(100dvh-6rem)]");
    expect(balanceSection.parentElement?.className).toContain("overflow-y-auto");
    expect(within(balanceSection).getByText("銀行 B")).toBeTruthy();
    expect(balanceSection.textContent).toContain("月末予測残高-60,000円");
    expect(within(balanceSection).getByText("-60,000円").className).toContain(
      "text-balance-negative",
    );
    expect(within(balanceSection).getByRole("link").getAttribute("href")).toBe(
      "/cf#bank-forecast-account-2",
    );
    expect(within(statusSection).getByText("銀行 A")).toBeTruthy();
    const alertLink = within(balanceSection).getByRole("link");
    alertLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(alertLink);
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it("残高注意だけでも通知を表示する", () => {
    render(
      <NotificationPopover
        errorAccounts={[]}
        updatingAccounts={[]}
        balanceAlerts={[{ accountId: 2, accountName: "銀行 B", forecastBalance: 100_000 }]}
      />,
    );

    expect(screen.getByRole("region", { name: "残高注意" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "更新ステータス" })).toBeNull();
    expect(screen.queryByText("通知はありません")).toBeNull();
  });

  it("更新ステータスの口座を選択したことを通知する", () => {
    const onNavigate = vi.fn<() => void>();
    render(
      <NotificationPopover
        errorAccounts={[{ id: 1, mfId: "account-1", name: "銀行 A", status: "error" }]}
        updatingAccounts={[{ id: 2, mfId: "account-2", name: "カード A", status: "updating" }]}
        balanceAlerts={[]}
        onNavigate={onNavigate}
      />,
    );

    for (const link of screen.getAllByRole("link")) {
      link.addEventListener("click", (event) => event.preventDefault());
      fireEvent.click(link);
    }

    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it("すべての通知がなければ空状態を表示する", () => {
    render(<NotificationPopover errorAccounts={[]} updatingAccounts={[]} balanceAlerts={[]} />);

    expect(screen.getByText("通知はありません")).toBeTruthy();
  });
});
