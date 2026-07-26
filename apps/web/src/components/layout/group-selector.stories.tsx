import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GroupSelectorClient } from "./group-selector.client";

const meta = {
  title: "Layout/GroupSelector",
  component: GroupSelectorClient,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/",
      },
    },
  },
} satisfies Meta<typeof GroupSelectorClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    groups: [
      { id: "1", name: "個人資産", isCurrent: true, lastScrapedAt: "2025-04-30T10:30:00" },
      { id: "2", name: "家族", isCurrent: false, lastScrapedAt: "2025-04-30T15:20:00" },
      { id: "3", name: "投資用", isCurrent: false, lastScrapedAt: "2025-04-29T09:00:00" },
    ],
    defaultGroupId: "1",
  },
};

export const TwoGroups: Story = {
  args: {
    groups: [
      { id: "1", name: "メイン", isCurrent: true, lastScrapedAt: "2025-04-30T10:30:00" },
      { id: "2", name: "サブ", isCurrent: false, lastScrapedAt: "2025-04-30T15:20:00" },
    ],
    defaultGroupId: "1",
  },
};

export const LongGroupNames: Story = {
  args: {
    groups: [
      {
        id: "1",
        name: "非常に長いグループ名のテスト",
        isCurrent: true,
        lastScrapedAt: "2025-04-30T10:30:00",
      },
      {
        id: "2",
        name: "もう一つの長いグループ名",
        isCurrent: false,
        lastScrapedAt: "2025-04-30T15:20:00",
      },
    ],
    defaultGroupId: "1",
  },
};

export const OnGroupPage: Story = {
  args: {
    groups: [
      {
        id: "default-group",
        name: "個人資産",
        isCurrent: true,
        lastScrapedAt: "2025-04-30T10:30:00",
      },
      { id: "family-group", name: "家族", isCurrent: false, lastScrapedAt: "2025-04-30T15:20:00" },
      { id: "investment", name: "投資用", isCurrent: false, lastScrapedAt: "2025-04-29T09:00:00" },
    ],
    defaultGroupId: "default-group",
  },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/family-group/cf",
      },
    },
  },
};
