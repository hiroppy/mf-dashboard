import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CompoundSimulator } from "./compound-simulator";

const meta = {
  title: "Charts/CompoundSimulator",
  component: CompoundSimulator,
  tags: ["autodocs"],
  parameters: {
    a11y: {
      config: {
        rules: [
          // base-ui NumberField generates internal IDs for aria-controls that axe cannot resolve in test environments
          { id: "aria-valid-attr-value", enabled: false },
        ],
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[800px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CompoundSimulator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const WithInitialAmount: Story = {
  args: {
    defaultInitialAmount: 1000000,
  },
};

export const WithLargeInitialAmount: Story = {
  args: {
    defaultInitialAmount: 5000000,
    title: "投資信託シミュレーション",
  },
};

export const WithPortfolioContext: Story = {
  args: {
    defaultInitialAmount: 3500000,
    defaultMonthlyContribution: 50000,
    defaultAnnualReturnRate: 7.2,
    portfolioContext: {
      initialAmountSource: "あなたの投資総額",
      monthlyContributionSource: "月の余剰額(100,000円)の50%から推定",
      annualReturnRateSource: "過去12ヶ月の実績年率",
      currentTotalAssets: 8000000,
      savingsRate: 25,
    },
  },
};

export const WithPartialContext: Story = {
  args: {
    defaultInitialAmount: 2000000,
    defaultMonthlyContribution: 30000,
    portfolioContext: {
      initialAmountSource: "あなたの投資総額",
      currentTotalAssets: 5000000,
    },
  },
};

export const LowSavingsRate: Story = {
  args: {
    defaultInitialAmount: 500000,
    defaultMonthlyContribution: 10000,
    defaultAnnualReturnRate: 3,
    portfolioContext: {
      initialAmountSource: "あなたの投資総額",
      monthlyContributionSource: "月の余剰額(20,000円)の50%から推定",
      annualReturnRateSource: "過去12ヶ月の実績年率",
      currentTotalAssets: 1500000,
      savingsRate: 5,
    },
  },
};

export const WithWithdrawalRate: Story = {
  args: {
    defaultInitialAmount: 5_000_000,
    defaultWithdrawalRate: 4,
    defaultWithdrawalYears: 25,
  },
};

export const WithWithdrawalAmount: Story = {
  args: {
    defaultInitialAmount: 5_000_000,
    defaultWithdrawalMode: "amount",
    defaultMonthlyWithdrawal: 200_000,
    defaultWithdrawalYears: 25,
  },
};

export const WithAge: Story = {
  args: {
    defaultInitialAmount: 5_000_000,
    defaultMonthlyContribution: 50_000,
    defaultCurrentAge: 30,
  },
};

export const WithSP500Preset: Story = {
  args: {
    defaultInitialAmount: 1_000_000,
    defaultMonthlyContribution: 50_000,
    defaultAnnualReturnRate: 10,
  },
};
