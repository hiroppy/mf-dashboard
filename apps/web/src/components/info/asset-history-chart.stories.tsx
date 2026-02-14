import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getAssetHistoryWithCategories } from "@mf-dashboard/db";
import { userEvent, within, mocked } from "storybook/test";
import { AssetHistoryChart } from "./asset-history-chart";

const generateMockData = () => {
  const days = 730; // 2年分
  const startDate = new Date(2024, 0, 1);

  // Generate in DESC order (newest first) like the DB returns
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + (days - 1 - i));
    const t = (days - 1 - i) / days;

    // 各カテゴリが緩やかに上昇 + 小さなランダム変動
    const j = days - 1 - i;
    const noise = (seed: number) =>
      Math.sin(j * 0.3 + seed) * 50000 + Math.sin(j * 0.07 + seed * 2) * 100000;

    const deposit = 4000000 + t * 1500000 + noise(1);
    const stock = 2000000 + t * 2500000 + noise(2);
    const fund = 1500000 + t * 1800000 + noise(3);
    const pension = 800000 + t * 600000 + noise(4);
    const point = 50000 + t * 30000 + noise(5) * 0.1;

    return {
      date: date.toISOString().split("T")[0],
      totalAssets: deposit + stock + fund + pension + point,
      categories: {
        "預金・現金・暗号資産": Math.round(deposit),
        "株式(現物)": Math.round(stock),
        投資信託: Math.round(fund),
        年金: Math.round(pension),
        ポイント: Math.round(point),
      },
    };
  });
};

const meta = {
  title: "Info/AssetHistoryChart",
  component: AssetHistoryChart,
  tags: ["autodocs"],
} satisfies Meta<typeof AssetHistoryChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  beforeEach() {
    mocked(getAssetHistoryWithCategories).mockResolvedValue(generateMockData());
  },
};

export const PeriodToggleTest: Story = {
  beforeEach() {
    mocked(getAssetHistoryWithCategories).mockResolvedValue(generateMockData());
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button1m = canvas.getByText("1ヶ月");
    await userEvent.click(button1m);

    const buttonAll = canvas.getByText("全期間");
    await userEvent.click(buttonAll);
  },
};

export const Empty: Story = {
  beforeEach() {
    mocked(getAssetHistoryWithCategories).mockResolvedValue([]);
  },
};
