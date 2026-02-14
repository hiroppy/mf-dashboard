import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getAccountByMfId } from "@mf-dashboard/db";
import { getHoldingsByAccountId } from "@mf-dashboard/db";
import { mocked } from "storybook/test";
import { AccountSummaryCard } from "./account-summary-card";

const meta = {
  title: "Info/AccountSummaryCard",
  component: AccountSummaryCard,
  tags: ["autodocs"],
} satisfies Meta<typeof AccountSummaryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockAccount = {
  id: 1,
  mfId: "abc123",
  groupId: 1,
  name: "サンプル証券",
  type: "証券",
  categoryName: "証券",
  institution: "サンプル証券",
  status: "ok",
  lastUpdated: "2025-04-26T10:30:00",
  errorMessage: null,
  totalAssets: 15000000,
  createdAt: "2025-04-01T00:00:00Z",
  updatedAt: "2025-04-01T00:00:00Z",
};

const assetHoldings = [
  {
    id: 1,
    name: "eMAXIS Slim 全世界株式",
    type: "asset",
    liabilityCategory: null,
    categoryName: "投資信託",
    accountName: "サンプル証券",
    institution: "サンプル証券",
    amount: 5000000,
    quantity: 25000,
    unitPrice: 200,
    avgCostPrice: 140,
    dailyChange: 50000,
    unrealizedGain: 1500000,
    unrealizedGainPct: 42.8,
  },
  {
    id: 2,
    name: "eMAXIS Slim 米国株式(S&P500)",
    type: "asset",
    liabilityCategory: null,
    categoryName: "投資信託",
    accountName: "サンプル証券",
    institution: "サンプル証券",
    amount: 3000000,
    quantity: 15000,
    unitPrice: 200,
    avgCostPrice: 146.67,
    dailyChange: -20000,
    unrealizedGain: 800000,
    unrealizedGainPct: 36.4,
  },
  {
    id: 3,
    name: "預り金",
    type: "asset",
    liabilityCategory: null,
    categoryName: "預金・現金・暗号資産",
    accountName: "サンプル証券",
    institution: "サンプル証券",
    amount: 500000,
    quantity: null,
    unitPrice: null,
    avgCostPrice: null,
    dailyChange: null,
    unrealizedGain: null,
    unrealizedGainPct: null,
  },
];

const liabilityHoldings = [
  {
    id: 10,
    name: "信用取引",
    type: "liability",
    liabilityCategory: "その他の負債",
    categoryName: null,
    accountName: "サンプル証券",
    institution: "サンプル証券",
    amount: 500000,
    quantity: null,
    unitPrice: null,
    avgCostPrice: null,
    dailyChange: null,
    unrealizedGain: null,
    unrealizedGainPct: null,
  },
];

export const Default: Story = {
  args: {
    mfId: "abc123",
  },
  beforeEach() {
    mocked(getAccountByMfId).mockResolvedValue(mockAccount);
    mocked(getHoldingsByAccountId).mockResolvedValue([...assetHoldings, ...liabilityHoldings]);
  },
};

export const AssetsOnly: Story = {
  name: "資産のみ",
  args: {
    mfId: "abc123",
  },
  beforeEach() {
    mocked(getAccountByMfId).mockResolvedValue(mockAccount);
    mocked(getHoldingsByAccountId).mockResolvedValue(assetHoldings);
  },
};

export const LiabilitiesOnly: Story = {
  name: "負債のみ",
  args: {
    mfId: "abc123",
  },
  beforeEach() {
    mocked(getAccountByMfId).mockResolvedValue({
      ...mockAccount,
      totalAssets: 0,
    });
    mocked(getHoldingsByAccountId).mockResolvedValue(liabilityHoldings);
  },
};

export const NoHoldings: Story = {
  name: "保有なし",
  args: {
    mfId: "abc123",
  },
  beforeEach() {
    mocked(getAccountByMfId).mockResolvedValue({
      ...mockAccount,
      totalAssets: 1000000,
    });
    mocked(getHoldingsByAccountId).mockResolvedValue([]);
  },
};

export const AccountNotFound: Story = {
  name: "アカウントが見つからない",
  args: {
    mfId: "unknown",
  },
  beforeEach() {
    mocked(getAccountByMfId).mockResolvedValue(null);
  },
};
