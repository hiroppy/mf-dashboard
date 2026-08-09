import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { NotificationPopover } from "./notification-popover";

const meta = {
  component: NotificationPopover,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="w-[350px] p-4 border rounded-md bg-popover">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NotificationPopover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoIssues: Story = {
  args: {
    errorAccounts: [],
    updatingAccounts: [],
    balanceAlerts: [],
  },
};

export const ErrorOnly: Story = {
  args: {
    errorAccounts: [
      {
        id: 1,
        mfId: "account-1",
        name: "User Aの銀行口座",
        status: "error",
      },
      {
        id: 2,
        mfId: "account-2",
        name: "User Bのクレジットカード",
        status: "error",
      },
    ],
    updatingAccounts: [],
    balanceAlerts: [],
  },
};

export const UpdatingOnly: Story = {
  args: {
    errorAccounts: [],
    updatingAccounts: [
      {
        id: 3,
        mfId: "account-3",
        name: "User Cの証券口座",
        status: "updating",
      },
    ],
    balanceAlerts: [],
  },
};

export const BothErrorAndUpdating: Story = {
  args: {
    errorAccounts: [
      {
        id: 1,
        mfId: "account-1",
        name: "User Aの銀行口座",
        status: "error",
      },
      {
        id: 2,
        mfId: "account-2",
        name: "User Bのクレジットカード",
        status: "error",
      },
    ],
    updatingAccounts: [
      {
        id: 3,
        mfId: "account-3",
        name: "User Cの証券口座",
        status: "updating",
      },
      {
        id: 4,
        mfId: "account-4",
        name: "User Dの電子マネー",
        status: "updating",
      },
    ],
    balanceAlerts: [],
  },
};

export const BalanceAlerts: Story = {
  args: {
    errorAccounts: [],
    updatingAccounts: [],
    balanceAlerts: [
      { accountId: 1, accountName: "銀行 A", forecastBalance: -60_000 },
      { accountId: 2, accountName: "銀行 B", forecastBalance: 85_000 },
    ],
  },
};

export const ManyAccounts: Story = {
  args: {
    errorAccounts: [
      {
        id: 1,
        mfId: "account-1",
        name: "User Aの銀行口座",
        status: "error",
      },
      {
        id: 2,
        mfId: "account-2",
        name: "User Bのクレジットカード",
        status: "error",
      },
      {
        id: 3,
        mfId: "account-3",
        name: "User Cの証券口座",
        status: "error",
      },
    ],
    updatingAccounts: [
      {
        id: 4,
        mfId: "account-4",
        name: "User Dの電子マネー",
        status: "updating",
      },
      {
        id: 5,
        mfId: "account-5",
        name: "User Eのポイント",
        status: "updating",
      },
    ],
    balanceAlerts: [],
  },
};
