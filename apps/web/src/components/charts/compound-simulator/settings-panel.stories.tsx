import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import type { WithdrawalMode } from "./compound-simulator-types";
import { SettingsPanel, type SettingsPanelProps } from "./settings-panel";

const meta = {
  title: "Charts/CompoundSimulator/SettingsPanel",
  component: SettingsPanel,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[900px] p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SettingsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const settingsArgs: SettingsPanelProps = {
  currentAge: 35,
  onCurrentAgeChange: () => {},
  contributionYears: 25,
  onContributionYearsChange: () => {},
  withdrawalStartYear: 30,
  onWithdrawalStartYearChange: () => {},
  withdrawalYears: 30,
  onWithdrawalYearsChange: () => {},
  selectedPreset: "custom",
  onPresetChange: () => {},
  initialAmount: 1_000_000,
  onInitialAmountChange: () => {},
  monthlyContribution: 50_000,
  onMonthlyContributionChange: () => {},
  annualReturnRate: 5,
  onAnnualReturnRateChange: () => {},
  expenseRatio: 0.1,
  onExpenseRatioChange: () => {},
  inflationRate: 2,
  onInflationRateChange: () => {},
  volatility: 15,
  onVolatilityChange: () => {},
  withdrawalMode: "amount",
  onWithdrawalModeChange: () => {},
  withdrawalRate: 4,
  onWithdrawalRateChange: () => {},
  fixedMonthlyWithdrawal: 200_000,
  onFixedMonthlyWithdrawalChange: () => {},
  initialAnnualWithdrawal: 760_000,
  initialMonthlyWithdrawal: 63_333,
  monthlyWithdrawalForSummary: 200_000,
  adjustedMonthlyPension: 124_100,
  basePension: 146_000,
  onBasePensionChange: () => {},
  pensionStartAge: 65,
  onPensionStartAgeChange: () => {},
  monthlyOtherIncome: 0,
  onMonthlyOtherIncomeChange: () => {},
  taxFree: false,
  onTaxFreeChange: () => {},
  inflationAdjustedWithdrawal: false,
  onInflationAdjustedWithdrawalChange: () => {},
  portfolioContext: {
    monthlyContributionSource: "月の余剰額から推定",
    annualReturnRateSource: "テスト用の推定値",
  },
};

export const Default: Story = {
  args: settingsArgs,
  render: () => {
    const [currentAge, setCurrentAge] = useState<number | undefined>(35);
    const [contributionYears, setContributionYears] = useState(25);
    const [withdrawalStartYear, setWithdrawalStartYear] = useState(30);
    const [withdrawalYears, setWithdrawalYears] = useState(30);
    const [selectedPreset, setSelectedPreset] = useState("all-country");
    const [initialAmount, setInitialAmount] = useState(1_000_000);
    const [monthlyContribution, setMonthlyContribution] = useState(50_000);
    const [annualReturnRate, setAnnualReturnRate] = useState(5);
    const [expenseRatio, setExpenseRatio] = useState(0.1);
    const [inflationRate, setInflationRate] = useState(2);
    const [volatility, setVolatility] = useState(15);
    const [withdrawalMode, setWithdrawalMode] = useState<WithdrawalMode>("amount");
    const [withdrawalRate, setWithdrawalRate] = useState(4);
    const [fixedMonthlyWithdrawal, setFixedMonthlyWithdrawal] = useState(200_000);
    const [basePension, setBasePension] = useState(146_000);
    const [pensionStartAge, setPensionStartAge] = useState(65);
    const [monthlyOtherIncome, setMonthlyOtherIncome] = useState(0);
    const [taxFree, setTaxFree] = useState(false);
    const [inflationAdjustedWithdrawal, setInflationAdjustedWithdrawal] = useState(false);

    const rateBasis = initialAmount + monthlyContribution * contributionYears * 12;
    const initialAnnualWithdrawal = Math.round((rateBasis * withdrawalRate) / 100);
    const initialMonthlyWithdrawal = Math.round(initialAnnualWithdrawal / 12);
    const adjustedMonthlyPension = Math.round(basePension * 0.85);
    const handleVolatilityChange = (value: number) => {
      setVolatility(value);
      setSelectedPreset("custom");
    };

    return (
      <SettingsPanel
        currentAge={currentAge}
        onCurrentAgeChange={setCurrentAge}
        contributionYears={contributionYears}
        onContributionYearsChange={setContributionYears}
        withdrawalStartYear={withdrawalStartYear}
        onWithdrawalStartYearChange={setWithdrawalStartYear}
        withdrawalYears={withdrawalYears}
        onWithdrawalYearsChange={setWithdrawalYears}
        selectedPreset={selectedPreset}
        onPresetChange={setSelectedPreset}
        initialAmount={initialAmount}
        onInitialAmountChange={setInitialAmount}
        monthlyContribution={monthlyContribution}
        onMonthlyContributionChange={setMonthlyContribution}
        annualReturnRate={annualReturnRate}
        onAnnualReturnRateChange={setAnnualReturnRate}
        expenseRatio={expenseRatio}
        onExpenseRatioChange={setExpenseRatio}
        inflationRate={inflationRate}
        onInflationRateChange={setInflationRate}
        volatility={volatility}
        onVolatilityChange={handleVolatilityChange}
        withdrawalMode={withdrawalMode}
        onWithdrawalModeChange={setWithdrawalMode}
        withdrawalRate={withdrawalRate}
        onWithdrawalRateChange={setWithdrawalRate}
        fixedMonthlyWithdrawal={fixedMonthlyWithdrawal}
        onFixedMonthlyWithdrawalChange={setFixedMonthlyWithdrawal}
        initialAnnualWithdrawal={initialAnnualWithdrawal}
        initialMonthlyWithdrawal={initialMonthlyWithdrawal}
        monthlyWithdrawalForSummary={fixedMonthlyWithdrawal}
        adjustedMonthlyPension={adjustedMonthlyPension}
        basePension={basePension}
        onBasePensionChange={setBasePension}
        pensionStartAge={pensionStartAge}
        onPensionStartAgeChange={setPensionStartAge}
        monthlyOtherIncome={monthlyOtherIncome}
        onMonthlyOtherIncomeChange={setMonthlyOtherIncome}
        taxFree={taxFree}
        onTaxFreeChange={setTaxFree}
        inflationAdjustedWithdrawal={inflationAdjustedWithdrawal}
        onInflationAdjustedWithdrawalChange={setInflationAdjustedWithdrawal}
        portfolioContext={{
          monthlyContributionSource: "月の余剰額から推定",
          annualReturnRateSource: "テスト用の推定値",
        }}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("slider", { name: "インフレ率" })).toHaveAttribute(
      "aria-valuenow",
      "2",
    );

    const volatilitySlider = canvas.getByRole("slider", { name: "ボラティリティ" });
    await userEvent.click(volatilitySlider);
    await userEvent.keyboard("{ArrowRight}");

    await expect(volatilitySlider).toHaveAttribute("aria-valuenow", "16");
    await expect(canvas.getByRole("combobox", { name: "商品プリセット" })).toHaveTextContent(
      "カスタム",
    );
  },
};
