import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BankForecastManualEventsClient } from "./bank-forecast-manual-events.client";

const meta = {
  component: BankForecastManualEventsClient,
  args: {
    accounts: [
      { id: 1, name: "銀行 A" },
      { id: 2, name: "銀行 B" },
    ],
    events: [
      {
        id: 1,
        accountId: 1,
        date: "2026-10-15",
        amount: 120_000,
        direction: "expense",
        description: "予定納税",
      },
      {
        id: 2,
        accountId: 2,
        date: "2026-11-01",
        amount: 50_000,
        direction: "income",
        description: "臨時収入",
      },
    ],
    minDate: "2026-08-10",
  },
} satisfies Meta<typeof BankForecastManualEventsClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: { events: [] },
};

export const ReadOnlyDemo: Story = {
  args: { allowEditing: false },
};
