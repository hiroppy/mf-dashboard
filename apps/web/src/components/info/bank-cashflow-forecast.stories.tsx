import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";
import type { BankCashFlowForecastView } from "./bank-cashflow-forecast-data";
import { BankCashFlowForecastClient } from "./bank-cashflow-forecast.client";

const evidence = {
  lookbackMonths: 12,
  occurrenceCount: 3,
  dateRange: { from: "2026-05-25", to: "2026-07-25" },
  amountRange: { min: 270_000, max: 290_000 },
};

const forecasts: BankCashFlowForecastView[] = [
  {
    accountId: "bank-a",
    accountName: "銀行 A",
    currentBalance: 420_000,
    balanceAsOfDate: "2026-08-03",
    forecastBoundaryDate: "2026-08-03",
    monthStartDate: "2026-08-01",
    monthEndDate: "2026-08-31",
    openingBalance: 415_000,
    monthEndBalance: 615_000,
    excludedEvents: [],
    days: [
      {
        date: "2026-08-02",
        incomeTotal: 5_000,
        expenseTotal: 0,
        netChange: 5_000,
        closingBalance: 420_000,
        events: [
          {
            id: "actual-a",
            accountId: "bank-a",
            date: "2026-08-02",
            amount: 5_000,
            direction: "income",
            status: "actual",
            description: "利息",
            balanceAfter: 420_000,
          },
        ],
      },
      {
        date: "2026-08-25",
        incomeTotal: 280_000,
        expenseTotal: 80_000,
        netChange: 200_000,
        closingBalance: 620_000,
        events: [
          {
            id: "forecast-a",
            accountId: "bank-a",
            date: "2026-08-25",
            amount: 280_000,
            direction: "income",
            status: "forecast",
            description: "給与振込",
            classification: "salary",
            confidence: "high",
            evidence,
            balanceAfter: 700_000,
          },
          {
            id: "review-a",
            accountId: "bank-a",
            date: "2026-08-25",
            amount: 80_000,
            direction: "expense",
            status: "needs_review",
            description: "口座振替",
            classification: "other",
            confidence: "low",
            evidence: {
              ...evidence,
              occurrenceCount: 1,
              amountRange: { min: 80_000, max: 80_000 },
            },
            balanceAfter: 620_000,
          },
        ],
      },
      {
        date: "2026-08-27",
        incomeTotal: 0,
        expenseTotal: 5_000,
        netChange: -5_000,
        closingBalance: 615_000,
        events: [
          {
            id: "forecast-b",
            accountId: "bank-a",
            date: "2026-08-27",
            amount: 5_000,
            direction: "expense",
            status: "forecast",
            description: "ローン返済",
            classification: "loan",
            confidence: "medium",
            evidence: { ...evidence, amountRange: { min: 5_000, max: 5_000 } },
            balanceAfter: 615_000,
          },
        ],
      },
    ],
  },
  {
    accountId: "bank-b",
    accountName: "銀行 B",
    currentBalance: 85_000,
    balanceAsOfDate: "2026-08-03",
    forecastBoundaryDate: "2026-08-03",
    monthStartDate: "2026-08-01",
    monthEndDate: "2026-08-31",
    openingBalance: 85_000,
    monthEndBalance: 85_000,
    days: [],
    excludedEvents: [],
  },
];

const meta = {
  title: "Info/BankCashFlowForecast",
  component: BankCashFlowForecastClient,
  tags: ["autodocs"],
} satisfies Meta<typeof BankCashFlowForecastClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { forecasts },
  async play({ canvasElement }) {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "入出金の詳細（4件）" }),
    );
  },
};

export const NegativeForecast: Story = {
  args: {
    forecasts: [
      {
        ...forecasts[0]!,
        accountName: "銀行 C",
        currentBalance: 20_000,
        monthEndBalance: -60_000,
      },
    ],
  },
};
