import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { AccountNotificationsClient } from "../info/account-notifications.client";
import { Header } from "./header";
import { SidebarProvider } from "./sidebar-context";

const mockGroups = [
  { id: "1", name: "個人資産", isCurrent: true, lastScrapedAt: "2025-04-30T10:30:00" },
  { id: "2", name: "家族", isCurrent: false, lastScrapedAt: "2025-04-30T15:20:00" },
];

const meta = {
  title: "Layout/Header",
  component: Header,
  tags: ["autodocs"],
  decorators: [
    (Story: () => ReactNode) => (
      <SidebarProvider>
        <Story />
      </SidebarProvider>
    ),
  ],
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/",
      },
    },
  },
} satisfies Meta<typeof Header>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    groups: mockGroups,
    defaultGroupId: "1",
    notifications: (
      <AccountNotificationsClient errorAccounts={[]} updatingAccounts={[]} totalIssues={0} />
    ),
  },
};

export const SingleGroup: Story = {
  args: {
    groups: [mockGroups[0]],
    defaultGroupId: "1",
    notifications: (
      <AccountNotificationsClient errorAccounts={[]} updatingAccounts={[]} totalIssues={0} />
    ),
  },
};

export const NoGroup: Story = {
  args: {
    groups: [],
    defaultGroupId: null,
    notifications: (
      <AccountNotificationsClient errorAccounts={[]} updatingAccounts={[]} totalIssues={0} />
    ),
  },
};

export const WithNotifications: Story = {
  args: {
    groups: mockGroups,
    defaultGroupId: "1",
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
