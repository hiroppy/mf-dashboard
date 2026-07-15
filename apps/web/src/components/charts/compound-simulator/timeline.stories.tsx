import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { InteractiveTimelineBar, TimelinePhaseChips } from "./timeline";

const meta = {
  title: "Charts/CompoundSimulator/Timeline",
  component: InteractiveTimelineBar,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[720px] p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InteractiveTimelineBar>;

export default meta;
type Story = StoryObj<typeof meta>;

const timelineArgs = {
  contributionYears: 30,
  withdrawalStartYear: 35,
  withdrawalYears: 25,
  onContributionYearsChange: () => {},
  onWithdrawalStartYearChange: () => {},
  onWithdrawalYearsChange: () => {},
  currentAge: 35,
};

export const Interactive: Story = {
  args: timelineArgs,
  render: () => {
    const [contributionYears, setContributionYears] = useState(30);
    const [withdrawalStartYear, setWithdrawalStartYear] = useState(35);
    const [withdrawalYears, setWithdrawalYears] = useState(25);

    return (
      <InteractiveTimelineBar
        contributionYears={contributionYears}
        withdrawalStartYear={withdrawalStartYear}
        withdrawalYears={withdrawalYears}
        onContributionYearsChange={setContributionYears}
        onWithdrawalStartYearChange={setWithdrawalStartYear}
        onWithdrawalYearsChange={setWithdrawalYears}
        currentAge={35}
      />
    );
  },
};

export const PhaseChips: Story = {
  args: timelineArgs,
  render: () => (
    <TimelinePhaseChips
      contributionYears={25}
      withdrawalStartYear={20}
      withdrawalYears={30}
      currentYear={2026}
      currentAge={40}
    />
  ),
};
