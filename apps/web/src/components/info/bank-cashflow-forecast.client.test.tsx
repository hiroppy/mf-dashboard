import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BANK_FORECAST_ANCHOR_CHANGE_EVENT } from "./bank-cashflow-forecast-anchor";
import type { BankCashFlowForecastView } from "./bank-cashflow-forecast-data";
import { BankCashFlowForecastClient } from "./bank-cashflow-forecast.client";

const routerRefreshMock = vi.hoisted(() => vi.fn<() => void>());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: routerRefreshMock }) }));

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  routerRefreshMock.mockReset();
});

const forecast: BankCashFlowForecastView = {
  accountId: 1,
  accountName: "銀行 A",
  currentBalance: 100_000,
  forecastBoundaryDate: "2026-08-03",
  monthStartDate: "2026-08-01",
  openingBalance: 100_000,
  monthEndBalance: 90_000,
  days: [
    {
      date: "2026-08-20",
      closingBalance: 90_000,
      events: [
        {
          id: "forecast-1",
          accountId: 1,
          date: "2026-08-20",
          amount: 10_000,
          direction: "expense",
          status: "forecast",
          description: "家賃",
          classification: "rent",
          recurringIdentity: "rent",
          evidence: {
            occurrenceCount: 3,
            dateRange: { from: "2026-05-20", to: "2026-07-20" },
            amountRange: { min: 10_000, max: 10_000 },
          },
          balanceAfter: 90_000,
        },
      ],
    },
  ],
};

describe("BankCashFlowForecastClient", () => {
  it("入出金の変動がない口座も表示する", () => {
    render(
      <BankCashFlowForecastClient
        forecasts={[
          {
            ...forecast,
            accountId: 2,
            accountName: "銀行 B",
            days: [],
            monthEndBalance: forecast.currentBalance,
          },
          {
            ...forecast,
            accountId: 3,
            accountName: "銀行 C",
            currentBalance: 200_000,
            days: [],
            monthEndBalance: 200_000,
          },
          forecast,
        ]}
      />,
    );

    expect(screen.getByText("銀行 A")).toBeTruthy();
    expect(screen.getByText("銀行 B")).toBeTruthy();
    expect(screen.getAllByText("8月3日時点（0件）")).toHaveLength(2);
    expect(
      screen
        .getAllByRole("button", { name: /入出金詳細を開く/ })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["銀行 Aの入出金詳細を開く"]);
    expect(screen.queryByRole("button", { name: "銀行 Bの入出金詳細を開く" })).toBeNull();
    expect(screen.queryByRole("button", { name: "銀行 Cの入出金詳細を開く" })).toBeNull();
  });

  it("スマホでも口座名と残高を横並びにする", () => {
    render(<BankCashFlowForecastClient forecasts={[forecast]} />);

    const header = screen.getByText("銀行 A").parentElement?.parentElement;
    expect(header?.className).toContain("justify-between");
    expect(header?.className).not.toContain("flex-col");
    const card = screen.getByRole("button", { name: "銀行 Aの入出金詳細を開く" });
    expect(card.className).toContain("cursor-pointer");
    expect(card.className).toContain("border-primary/30");
    expect(card.className).toContain("hover:border-primary");
    expect(screen.getByText("8月3日時点（1件）")).toBeTruthy();
    expect(screen.queryByText(/入出金の詳細（/)).toBeNull();
  });

  it("実績・予測の意味と今月予測の限界を説明する", () => {
    render(<BankCashFlowForecastClient forecasts={[forecast]} />);

    expect(screen.queryByRole("heading", { name: "表示の見方" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "表示の見方" }));

    expect(screen.getByRole("heading", { name: "表示の見方" })).toBeTruthy();
    expect(screen.getByText("Money Forwardから取得済みの入出金です。")).toBeTruthy();
    expect(screen.getByText(/過去の定期的な入出金から日付と金額を推定/)).toBeTruthy();
    expect(screen.queryByText("要確認")).toBeNull();
    expect(screen.getByText("実績").className).not.toBe(screen.getByText("確定").className);
    expect(screen.getByText("残高参考")).toBeTruthy();
    expect(screen.getByText(/今月だけの参考値.*過去月表示と任意月への切替は対象外/)).toBeTruthy();
  });

  it("詳細ボタンで日付別の入出金と取引後残高をダイアログに表示する", () => {
    render(<BankCashFlowForecastClient forecasts={[forecast]} />);

    const trigger = screen.getByRole("button", { name: "銀行 Aの入出金詳細を開く" });
    expect(screen.queryByText("家賃")).toBeNull();

    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "銀行 Aの入出金詳細" });
    expect(dialog.className).toContain("max-h-[calc(100dvh-2rem)]");
    expect(dialog.className).toContain("max-w-4xl");
    expect(dialog.className).toContain("overflow-hidden");
    expect(within(dialog).getByText("現在残高")).toBeTruthy();
    expect(within(dialog).getByText("月末予測残高")).toBeTruthy();
    const dialogHeader = within(dialog).getByRole("heading", {
      name: "銀行 Aの入出金詳細",
    }).parentElement?.parentElement;
    expect(dialogHeader?.className).toContain("grid-cols-[minmax(0,1fr)_auto]");
    expect(dialogHeader?.className).toContain("sm:grid-cols-[minmax(0,1fr)_auto_auto]");
    expect(within(dialog).getByText("現在残高").parentElement?.className).toContain("row-start-2");
    expect(within(dialog).getByRole("button", { name: "明細を閉じる" })).toBeTruthy();
    expect(screen.getByText("家賃").closest("div.overflow-y-auto")).toBeTruthy();
    expect(screen.getByText("家賃")).toBeTruthy();
    expect(screen.getByText(/取引後残高:/).textContent).toContain("90,000円");
    expect(screen.queryByText(/入出金後残高:/)).toBeNull();
    expect(screen.getByText(/過去3回/).textContent).toContain("10,000円");
    const amount = screen.getByText("-10,000円");
    expect(amount.className).toContain("text-balance-negative");
    expect(amount.parentElement?.className).toContain("text-right");
    expect(amount.closest("li")?.className).toContain("grid-cols-[minmax(0,1fr)_auto]");

    fireEvent.click(within(dialog).getByRole("button", { name: "明細を閉じる" }));
    expect(screen.queryByRole("dialog", { name: "銀行 Aの入出金詳細" })).toBeNull();
  });

  it("口座アンカーから対応する予想ダイアログを開く", async () => {
    window.history.replaceState(null, "", "/cf#bank-forecast-account-1");
    render(<BankCashFlowForecastClient forecasts={[forecast]} />);

    expect(document.querySelector("#bank-forecast-account-1")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "銀行 Aの入出金詳細" })).toBeTruthy(),
    );

    fireEvent.click(screen.getByRole("button", { name: "明細を閉じる" }));
    expect(window.location.hash).toBe("");

    window.history.replaceState(null, "", "/cf#bank-forecast-account-1");
    window.dispatchEvent(new Event(BANK_FORECAST_ANCHOR_CHANGE_EVENT));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "銀行 Aの入出金詳細" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "明細を閉じる" }));
  });

  it("入出金がない口座もアンカーから予想ダイアログを開く", async () => {
    window.history.replaceState(null, "", "/cf#bank-forecast-account-1");
    render(
      <BankCashFlowForecastClient
        forecasts={[{ ...forecast, days: [], monthEndBalance: forecast.currentBalance }]}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "銀行 Aの入出金詳細" });
    expect(within(dialog).getByText("表示する入出金はありません。")).toBeTruthy();
  });

  it("開いたダイアログで最後の入出金がなくなっても空状態を表示し続ける", () => {
    const { rerender } = render(<BankCashFlowForecastClient forecasts={[forecast]} />);

    fireEvent.click(screen.getByRole("button", { name: "銀行 Aの入出金詳細を開く" }));
    expect(screen.getByRole("dialog", { name: "銀行 Aの入出金詳細" })).toBeTruthy();

    rerender(
      <BankCashFlowForecastClient
        forecasts={[{ ...forecast, days: [], monthEndBalance: forecast.currentBalance }]}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "銀行 Aの入出金詳細" });
    expect(within(dialog).getByText("表示する入出金はありません。")).toBeTruthy();
    expect(screen.getByText("8月3日時点（0件）")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "明細を閉じる" }));
    expect(screen.queryByRole("dialog", { name: "銀行 Aの入出金詳細" })).toBeNull();
    expect(screen.queryByRole("button", { name: "銀行 Aの入出金詳細を開く" })).toBeNull();
  });

  it("Money Forwardの引き落とし予定額を根拠として表示する", () => {
    const confirmedForecast = structuredClone(forecast);
    confirmedForecast.days[0]!.events[0]!.amountSource = "scheduled_withdrawal";
    render(<BankCashFlowForecastClient forecasts={[confirmedForecast]} />);

    fireEvent.click(screen.getByRole("button", { name: "銀行 Aの入出金詳細を開く" }));

    expect(screen.getByText(/Money Forwardの引き落とし予定額/)).toBeTruthy();
    expect(screen.getByText("確定")).toBeTruthy();
  });

  it("定期予測をUIから却下する", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
    render(<BankCashFlowForecastClient forecasts={[forecast]} groupId="group-a" />);

    fireEvent.click(screen.getByRole("button", { name: "銀行 Aの入出金詳細を開く" }));
    fireEvent.click(screen.getByRole("button", { name: "予測から除外" }));
    expect(screen.getByText("本当にこの予測を除外しますか？")).toBeTruthy();
    expect(
      screen.getByText(/同じ名前の入出金が再び確認された場合は、自動的に予測へ戻ります/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "除外する" }));

    await waitFor(() => expect(routerRefreshMock).toHaveBeenCalledOnce());
    expect(screen.queryByRole("group", { name: "予測除外の確認" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bank-forecast/dismiss",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          accountId: 1,
          direction: "expense",
          recurringIdentity: "rent",
          dismissedThroughDate: "2026-07-20",
          groupId: "group-a",
        }),
      }),
    );
  });

  it("base path配下のAPIへ予測除外を送信する", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/dashboard");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
    render(<BankCashFlowForecastClient forecasts={[forecast]} />);

    fireEvent.click(screen.getByRole("button", { name: "銀行 Aの入出金詳細を開く" }));
    fireEvent.click(screen.getByRole("button", { name: "予測から除外" }));
    fireEvent.click(screen.getByRole("button", { name: "除外する" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/dashboard/api/bank-forecast/dismiss",
      expect.any(Object),
    );
  });

  it("確認をキャンセルした場合は除外しない", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<BankCashFlowForecastClient forecasts={[forecast]} />);

    fireEvent.click(screen.getByRole("button", { name: "銀行 Aの入出金詳細を開く" }));
    fireEvent.click(screen.getByRole("button", { name: "予測から除外" }));
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "予測除外の確認" })).toBeNull();
    expect(screen.getByRole("button", { name: "予測から除外" })).toBeTruthy();
  });

  it("通信失敗時は予測除外エラーを表示する", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network error"));
    render(<BankCashFlowForecastClient forecasts={[forecast]} />);

    fireEvent.click(screen.getByRole("button", { name: "銀行 Aの入出金詳細を開く" }));
    fireEvent.click(screen.getByRole("button", { name: "予測から除外" }));
    fireEvent.click(screen.getByRole("button", { name: "除外する" }));

    expect(await screen.findByText("予測を除外できませんでした。")).toBeTruthy();
    expect(routerRefreshMock).not.toHaveBeenCalled();
  });

  it("書き込み不可のデモでは除外操作を表示しない", () => {
    render(<BankCashFlowForecastClient forecasts={[forecast]} allowForecastDismissal={false} />);

    fireEvent.click(screen.getByRole("button", { name: "銀行 Aの入出金詳細を開く" }));

    expect(screen.queryByRole("button", { name: "予測から除外" })).toBeNull();
  });

  it("カード利用残高を参考にした予測へラベルを表示する", () => {
    const liabilityForecast = structuredClone(forecast);
    liabilityForecast.days[0]!.events[0]!.amountSource = "liability";
    render(<BankCashFlowForecastClient forecasts={[liabilityForecast]} />);

    fireEvent.click(screen.getByRole("button", { name: "銀行 Aの入出金詳細を開く" }));

    expect(screen.getByText(/Money Forwardのカード利用残高を参考/)).toBeTruthy();
    expect(screen.getByText("残高参考")).toBeTruthy();
  });

  it("根拠が1日の場合は日付を範囲表記しない", () => {
    const singleDateForecast = structuredClone(forecast);
    singleDateForecast.days[0]!.events[0]!.evidence = {
      occurrenceCount: 1,
      dateRange: { from: "2026-07-25", to: "2026-07-25" },
      amountRange: { min: 300_000, max: 300_000 },
    };
    render(<BankCashFlowForecastClient forecasts={[singleDateForecast]} />);

    fireEvent.click(screen.getByRole("button", { name: "銀行 Aの入出金詳細を開く" }));

    expect(screen.getByText(/過去1回（7月25日、300,000円）/)).toBeTruthy();
    expect(screen.queryByText(/7月25日〜7月25日/)).toBeNull();
  });
});
