import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { BankCashFlowForecastView } from "./bank-cashflow-forecast-data";
import { BankCashFlowForecastClient } from "./bank-cashflow-forecast.client";

afterEach(cleanup);

const forecast: BankCashFlowForecastView = {
  accountId: 1,
  accountName: "銀行 A",
  currentBalance: 100_000,
  balanceAsOfDate: "2026-08-03",
  forecastBoundaryDate: "2026-08-03",
  monthStartDate: "2026-08-01",
  monthEndDate: "2026-08-31",
  openingBalance: 100_000,
  monthEndBalance: 90_000,
  excludedEvents: [],
  days: [
    {
      date: "2026-08-20",
      incomeTotal: 0,
      expenseTotal: 10_000,
      netChange: -10_000,
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
          confidence: "high",
          evidence: {
            lookbackMonths: 12,
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
  it("詳細ボタンで日付別の入出金と入出金後残高を開閉する", () => {
    render(<BankCashFlowForecastClient forecasts={[forecast]} />);

    const trigger = screen.getByRole("button", { name: "入出金の詳細（1件）" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("家賃")).toBeNull();

    fireEvent.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("家賃")).toBeTruthy();
    expect(screen.getByText(/入出金後残高:/).textContent).toContain("90,000円");
    expect(screen.getByText(/過去3回/).textContent).toContain("10,000円");
  });
});
