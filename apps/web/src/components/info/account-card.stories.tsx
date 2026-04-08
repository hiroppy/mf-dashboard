import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AccountCard } from "./account-card";

const meta = {
  title: "Info/AccountCard",
  component: AccountCard,
  tags: ["autodocs"],
} satisfies Meta<typeof AccountCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    mfId: "abc123",
    name: "サンプル銀行",
    type: "銀行",
    status: "ok",
    lastUpdated: "2025-04-26T10:30:00",
    totalAssets: 3456789,
  },
};

export const ErrorStatus: Story = {
  args: {
    mfId: "def456",
    name: "サンプル証券",
    type: "証券",
    status: "error",
    lastUpdated: "2025-04-26T10:30:00",
    totalAssets: 1234567,
  },
};

export const UpdatingStatus: Story = {
  args: {
    mfId: "ghi789",
    name: "サンプルカード",
    type: "カード",
    status: "updating",
    lastUpdated: "2025-04-26T10:30:00",
    totalAssets: 45678,
  },
};

export const Manual: Story = {
  args: {
    mfId: "manual001",
    name: "現金",
    type: "手動",
    status: "unknown",
    lastUpdated: null,
    totalAssets: 100000,
  },
};

export const UnknownId: Story = {
  args: {
    mfId: "unknown",
    name: "不明な口座",
    type: "その他",
    status: "ok",
    lastUpdated: null,
    totalAssets: 0,
  },
};
