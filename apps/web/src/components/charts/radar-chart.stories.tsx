import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RadarChart } from "./radar-chart";

const meta = {
  title: "Charts/RadarChart",
  component: RadarChart,
  tags: ["autodocs"],
} satisfies Meta<typeof RadarChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    categories: [
      { name: "緊急予備資金", score: 20, maxScore: 25 },
      { name: "貯蓄率", score: 17, maxScore: 25 },
      { name: "投資分散度", score: 14, maxScore: 20 },
      { name: "資産成長", score: 10, maxScore: 15 },
      { name: "支出安定性", score: 15, maxScore: 15 },
    ],
  },
};

export const LowScores: Story = {
  args: {
    categories: [
      { name: "緊急予備資金", score: 5, maxScore: 25 },
      { name: "貯蓄率", score: 3, maxScore: 25 },
      { name: "投資分散度", score: 4, maxScore: 20 },
      { name: "資産成長", score: 2, maxScore: 15 },
      { name: "支出安定性", score: 5, maxScore: 15 },
    ],
  },
};

export const PerfectScores: Story = {
  args: {
    categories: [
      { name: "緊急予備資金", score: 25, maxScore: 25 },
      { name: "貯蓄率", score: 25, maxScore: 25 },
      { name: "投資分散度", score: 20, maxScore: 20 },
      { name: "資産成長", score: 15, maxScore: 15 },
      { name: "支出安定性", score: 15, maxScore: 15 },
    ],
  },
};
