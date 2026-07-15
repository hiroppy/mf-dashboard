import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { calculateCompound } from "./calculate-compound";
import { selectMilestones } from "./compound-simulator-utils";
import { ProjectionChart } from "./projection-chart";

const projections = calculateCompound({
  initialAmount: 1_000_000,
  monthlyContribution: 50_000,
  annualReturnRate: 5,
  contributionYears: 25,
  withdrawalStartYear: 30,
  withdrawalYears: 25,
  monthlyWithdrawal: 180_000,
  expenseRatio: 0.1,
  inflationRate: 2,
});

const meta = {
  title: "Charts/CompoundSimulator/ProjectionChart",
  component: ProjectionChart,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[900px] p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProjectionChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    projections,
    taxFree: false,
    currentAge: 35,
    contributionYears: 25,
    withdrawalStartYear: 30,
    withdrawalYears: 25,
    totalYears: 55,
    milestones: selectMilestones(projections.at(30)?.total ?? 0),
    currentTotalAssets: 4_000_000,
  },
};
