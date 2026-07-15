import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { buildFanChartData } from "./compound-simulator-utils";
import { MonteCarloChart } from "./monte-carlo-chart";

const fanChartData = buildFanChartData(
  [0, 5, 10, 15, 20, 25, 30].map((year) => {
    const base = 1_000_000 + year * 900_000;
    return {
      year,
      p10: base * 0.65,
      p25: base * 0.85,
      p50: base,
      p75: base * 1.2,
      p90: base * 1.45,
      principal: 1_000_000 + year * 600_000,
      isContributing: year > 0 && year <= 25,
      isWithdrawing: year > 30,
      depletionRate: year === 30 ? 0.03 : undefined,
    };
  }),
);

const meta = {
  title: "Charts/CompoundSimulator/MonteCarloChart",
  component: MonteCarloChart,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[900px] p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MonteCarloChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    fanChartData,
    currentAge: 35,
    taxFree: false,
    withdrawalYears: 25,
    contributionYears: 25,
    withdrawalStartYear: 30,
    totalYears: 55,
    inflationRate: 2,
    onInflationRateChange: () => {},
    volatility: 15,
    onVolatilityChange: () => {},
    copyData: {
      settings: {
        initialAmount: 1_000_000,
        monthlyContribution: 50_000,
        annualReturnRate: 5,
      },
    },
  },
};
