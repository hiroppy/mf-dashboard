import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { BankCashFlowForecastView } from "./bank-cashflow-forecast-data";
import { BankCashFlowForecastClient } from "./bank-cashflow-forecast.client";

const evidence = {
  occurrenceCount: 3,
  dateRange: { from: "2026-05-25", to: "2026-07-25" },
  amountRange: { min: 270_000, max: 290_000 },
};

const forecasts: BankCashFlowForecastView[] = [
  {
    accountId: 1,
    accountName: "銀行 A",
    currentBalance: 420_000,
    forecastBoundaryDate: "2026-08-03",
    monthStartDate: "2026-08-01",
    openingBalance: 415_000,
    monthEndBalance: 560_000,
    days: [
      {
        date: "2026-08-02",
        closingBalance: 420_000,
        events: [
          {
            id: "actual-a",
            accountId: 1,
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
        closingBalance: 700_000,
        events: [
          {
            id: "forecast-a",
            accountId: 1,
            date: "2026-08-25",
            amount: 280_000,
            direction: "income",
            status: "forecast",
            description: "給与振込",
            classification: "salary",
            recurringIdentity: "salary",
            evidence,
            balanceAfter: 700_000,
          },
        ],
      },
      {
        date: "2026-08-26",
        closingBalance: 640_000,
        events: [
          {
            id: "forecast-card",
            accountId: 1,
            date: "2026-08-26",
            amount: 60_000,
            direction: "expense",
            status: "forecast",
            description: "デビットカード支払い",
            classification: "card",
            amountSource: "liability",
            evidence: { ...evidence, amountRange: { min: 55_000, max: 65_000 } },
            balanceAfter: 640_000,
          },
        ],
      },
      {
        date: "2026-08-27",
        closingBalance: 560_000,
        events: [
          {
            id: "forecast-rent",
            accountId: 1,
            date: "2026-08-27",
            amount: 75_000,
            direction: "expense",
            status: "forecast",
            description: "家賃",
            classification: "rent",
            recurringIdentity: "rent",
            evidence: { ...evidence, amountRange: { min: 75_000, max: 75_000 } },
            balanceAfter: 565_000,
          },
          {
            id: "forecast-loan",
            accountId: 1,
            date: "2026-08-27",
            amount: 5_000,
            direction: "expense",
            status: "forecast",
            description: "ローン返済",
            classification: "loan",
            recurringIdentity: "loan",
            evidence: { ...evidence, amountRange: { min: 5_000, max: 5_000 } },
            balanceAfter: 560_000,
          },
        ],
      },
    ],
  },
  {
    accountId: 2,
    accountName: "銀行 B",
    currentBalance: 85_000,
    forecastBoundaryDate: "2026-08-03",
    monthStartDate: "2026-08-01",
    openingBalance: 85_000,
    monthEndBalance: 85_000,
    days: [],
  },
];

const meta = {
  title: "Info/BankCashFlowForecast",
  component: BankCashFlowForecastClient,
  tags: ["autodocs"],
  parameters: { nextjs: { appDirectory: true } },
} satisfies Meta<typeof BankCashFlowForecastClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { forecasts },
  async play({ canvasElement }) {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "表示の見方" }));
    const guide = await within(canvasElement.ownerDocument.body).findByRole("dialog", {
      name: "表示の見方",
    });
    await expect(within(guide).getByText(/今月だけの参考値/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "表示の見方" }));
    await userEvent.click(canvas.getByRole("button", { name: "銀行 Aの入出金詳細を開く" }));
    const details = await within(canvasElement.ownerDocument.body).findByRole("dialog", {
      name: "銀行 Aの入出金詳細",
    });
    await waitFor(() => expect(details).toBeVisible());

    for (const description of ["給与振込", "デビットカード支払い", "家賃", "ローン返済"]) {
      await expect(within(details).getByText(description)).toBeInTheDocument();
    }
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
