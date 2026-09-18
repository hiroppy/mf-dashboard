import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { TransactionStatsClient } from "./transaction-stats.client";

const meta = {
  title: "Info/TransactionStats",
  component: TransactionStatsClient,
  tags: ["autodocs"],
} satisfies Meta<typeof TransactionStatsClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    year: "2026",
    income: [
      {
        name: "給与",
        value: 4800000,
        categories: ["給与"],
        transactions: [
          {
            id: 1,
            date: "2026-06-25",
            description: "給与",
            amount: 400000,
            accountName: "口座 A",
            category: "給与",
          },
        ],
      },
      {
        name: "その他",
        value: 120000,
        categories: ["還付金", "臨時収入"],
        transactions: [
          {
            id: 2,
            date: "2026-05-10",
            description: "還付金",
            amount: 120000,
            accountName: "口座 A",
            category: "還付金",
          },
        ],
      },
    ],
    expense: [
      {
        name: "食費",
        value: 720000,
        categories: ["食費"],
        transactions: [
          {
            id: 3,
            date: "2026-06-25",
            description: "店舗 A",
            amount: 4500,
            accountName: "カード A",
            category: "食費",
          },
          {
            id: 5,
            date: "2026-06-20",
            description: "店舗 B",
            amount: 8000,
            accountName: "カード A",
            category: "食費",
          },
        ],
      },
      {
        name: "住宅",
        value: 1440000,
        categories: ["住宅"],
        transactions: [
          {
            id: 4,
            date: "2026-06-01",
            description: "住居費",
            amount: 120000,
            accountName: "口座 A",
            category: "住宅",
          },
        ],
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const screen = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: /食費/ }));

    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
    await expect(screen.getByText("2026年 食費の明細")).toBeVisible();
    await expect(screen.getByText("店舗 A")).toBeVisible();
    await expect(screen.getByText("2件")).toBeVisible();

    const descriptions = screen.getAllByText(/店舗 [AB]/);
    await expect(descriptions[0]).toHaveTextContent("店舗 B");
    await expect(descriptions[1]).toHaveTextContent("店舗 A");

    const sortSelect = screen.getByRole("combobox", { name: "並び順" });
    await expect(screen.queryByText("並び順")).toBeNull();
    await expect(sortSelect).toHaveTextContent("金額順");

    const selectSortAndExpectOrder = async (label: string, expectedDescriptions: string[]) => {
      await userEvent.click(sortSelect);
      await userEvent.click(await screen.findByRole("option", { name: label }));

      await waitFor(async () => {
        await expect(sortSelect).toHaveTextContent(label);
        await expect(screen.queryAllByRole("option")).toHaveLength(0);
        await expect(
          screen.getAllByText(/店舗 [AB]/).map(({ textContent }) => textContent),
        ).toEqual(expectedDescriptions);
      });
    };

    await selectSortAndExpectOrder("日付順", ["店舗 A", "店舗 B"]);
    await selectSortAndExpectOrder("金額順", ["店舗 B", "店舗 A"]);

    await userEvent.click(screen.getByRole("button", { name: "明細を閉じる" }));

    await expect(screen.queryByText("2026年 食費の明細")).toBeNull();

    await userEvent.click(canvas.getByRole("button", { name: /食費/ }));

    await expect(screen.getByRole("combobox", { name: "並び順" })).toHaveTextContent("金額順");
  },
};
