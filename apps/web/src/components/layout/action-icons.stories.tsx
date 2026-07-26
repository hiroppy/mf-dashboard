import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AccountNotificationsClient } from "../info/account-notifications.client";
import { ActionIcons, RefreshStatus } from "./action-icons";

const meta = {
  title: "Layout/ActionIcons",
  component: ActionIcons,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof ActionIcons>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Header: Story = {
  args: {
    variant: "header",
    notifications: (
      <AccountNotificationsClient errorAccounts={[]} updatingAccounts={[]} totalIssues={0} />
    ),
  },
};

export const HeaderWithNotifications: Story = {
  args: {
    variant: "header",
    notifications: (
      <AccountNotificationsClient
        errorAccounts={[{ id: 1, mfId: "account-1", name: "User Aの銀行口座", status: "error" }]}
        updatingAccounts={[
          { id: 2, mfId: "account-2", name: "User Bの証券口座", status: "updating" },
        ]}
        totalIssues={2}
      />
    ),
  },
};

export const UpdateStatus: Story = {
  args: {
    variant: "header",
  },
  render: () => (
    <RefreshStatus
      lastScrapedAt="2025-04-30T01:30:00.000Z"
      workflowUrl="https://github.com/example/example/actions/workflows/daily-update.yml"
    />
  ),
};

export const Sidebar: Story = {
  args: {
    variant: "sidebar",
  },
};
