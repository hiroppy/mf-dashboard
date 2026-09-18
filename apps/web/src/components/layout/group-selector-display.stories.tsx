import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GroupSelectorDisplay, groupSelectorContainerClassName } from "./group-selector-display";

const meta = {
  title: "Layout/GroupSelectorDisplay",
  component: GroupSelectorDisplay,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className={groupSelectorContainerClassName}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GroupSelectorDisplay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: "個人資産",
  },
};

export const LongName: Story = {
  args: {
    name: "非常に長いグループ名のテスト",
  },
};

export const ShortName: Story = {
  args: {
    name: "家族",
  },
};
