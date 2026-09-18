import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SummaryPanel } from "./summary-panel";

const meta = {
  title: "Charts/CompoundSimulator/SummaryPanel",
  component: SummaryPanel,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[900px] p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SummaryPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const contributionEnd = {
  year: 30,
  principal: 19_000_000,
  interest: 22_000_000,
  tax: 4_000_000,
  total: 37_000_000,
  yearlyWithdrawal: 0,
  isContributing: false,
  isWithdrawing: false,
};

const monteCarlo = {
  yearlyData: [],
  failureProbability: 0.08,
  depletionProbability: 0.03,
  distribution: [
    { rangeEnd: 0, count: 80, isDepleted: true },
    { rangeEnd: 10_000_000, count: 850, isDepleted: false },
    { rangeEnd: 30_000_000, count: 2100, isDepleted: false },
    { rangeEnd: 60_000_000, count: 1500, isDepleted: false },
    { rangeEnd: 100_000_000, count: 470, isDepleted: false },
  ],
  sensitivityRows: [
    {
      monthlyContribution: 40_000,
      delta: -10_000,
      depletionProbability: 0.06,
      securityScore: 88,
      medianFinalBalance: 30_000_000,
    },
    {
      monthlyContribution: 50_000,
      delta: 0,
      depletionProbability: 0.03,
      securityScore: 94,
      medianFinalBalance: 37_000_000,
    },
  ],
};

export const Default: Story = {
  args: {
    withdrawalYears: 30,
    contributionYears: 25,
    withdrawalStartYear: 30,
    currentYear: 2026,
    currentAge: 35,
    taxFree: false,
    contributionEnd,
    securityScore: 94,
    monthlyContribution: 50_000,
    withdrawalRate: 4,
    sensitivityRows: monteCarlo.sensitivityRows,
    sensitivityTableRows: monteCarlo.sensitivityRows,
    onApplyMonthly: () => {},
    onApplyRate: () => {},
    drawdownPercentile: "p50",
    onDrawdownPercentileChange: () => {},
    mcDrawdownEndValue: 37_000_000,
    totalWithdrawalAmount: 72_000_000,
    monteCarlo,
    summary: (
      <span>
        毎月5万円を積み立てた場合、65歳時点には
        <strong className="font-semibold text-foreground">約3,700万円</strong>
        になる見込みです。
      </span>
    ),
  },
};
