import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getAccountByMfId } from "@mf-dashboard/db";
import { getHoldingsByAccountId, getHoldingsWithLatestValues } from "@mf-dashboard/db";
import { mocked } from "storybook/test";
import { UnrealizedGainCard } from "./unrealized-gain-card";

const meta = {
  title: "Info/UnrealizedGainCard",
  component: UnrealizedGainCard,
  tags: ["autodocs"],
} satisfies Meta<typeof UnrealizedGainCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const createHolding = (
  name: string,
  amount: number,
  unrealizedGain: number,
  unrealizedGainPct: number | null = null,
  institution = "SBI証券",
  categoryName = "投資信託",
) => ({
  id: Math.random(),
  name,
  type: "asset" as const,
  liabilityCategory: null,
  categoryId: 1,
  categoryName,
  accountId: 1,
  accountName: "証券口座",
  institution,
  amount,
  quantity: 100,
  unitPrice: amount / 100,
  avgCostPrice: (amount - unrealizedGain) / 100,
  dailyChange: Math.round(unrealizedGain * 0.02),
  unrealizedGain,
  unrealizedGainPct,
});

export const Profit: Story = {
  name: "全て含み益",
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue([
      createHolding("eMAXIS Slim 全世界株式(オール・カントリー)", 5000000, 1200000, 31.5),
      createHolding("eMAXIS Slim 米国株式(S&P500)", 3000000, 800000, 36.4),
      createHolding("楽天・全米株式インデックス・ファンド", 2000000, 400000, 25.0),
      createHolding("ソニーグループ", 500000, 50000, 11.1),
    ]);
  },
};

export const Loss: Story = {
  name: "全て含み損",
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue([
      createHolding("日本株ファンド", 2000000, -300000, -13.0),
      createHolding("新興国株式インデックス", 1500000, -200000, -11.8),
      createHolding("不動産投資信託", 1000000, -150000, -13.0),
      createHolding("コモディティファンド", 500000, -80000, -13.8),
    ]);
  },
};

export const Mixed: Story = {
  name: "含み益と含み損の混合",
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue([
      createHolding("eMAXIS Slim 全世界株式", 5000000, 1200000, 31.5),
      createHolding("eMAXIS Slim 米国株式(S&P500)", 3000000, 800000, 36.4),
      createHolding("日本株ファンド", 2000000, -300000, -13.0),
      createHolding("新興国株式", 1500000, -200000, -11.8),
      createHolding("ソニーグループ", 500000, 50000, 11.1),
    ]);
  },
};

export const ManyHoldings: Story = {
  name: "多数の銘柄",
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue([
      createHolding("銘柄A (大型)", 8000000, 2000000, 33.3),
      createHolding("銘柄B", 3000000, 500000, 20.0),
      createHolding("銘柄C", 2500000, 400000, 19.0),
      createHolding("銘柄D", 2000000, -100000, -4.8),
      createHolding("銘柄E", 1500000, 200000, 15.4),
      createHolding("銘柄F", 1200000, -50000, -4.0),
      createHolding("銘柄G", 1000000, 150000, 17.6),
      createHolding("銘柄H", 800000, -30000, -3.6),
      createHolding("銘柄I", 600000, 80000, 15.4),
      createHolding("銘柄J", 400000, -20000, -4.8),
    ]);
  },
};

export const FewHoldings: Story = {
  name: "少数の銘柄",
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue([
      createHolding("メイン投資信託", 8000000, 2000000, 33.3),
      createHolding("サブ投資信託", 2000000, -100000, -4.8),
    ]);
  },
};

export const SingleHolding: Story = {
  name: "1銘柄のみ",
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue([
      createHolding("eMAXIS Slim 全世界株式", 10000000, 2500000, 33.3),
    ]);
  },
};

export const LongNames: Story = {
  name: "長い銘柄名",
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue([
      createHolding("eMAXIS Slim 全世界株式(オール・カントリー)除く日本", 5000000, 1200000, 31.5),
      createHolding("楽天・全米株式インデックス・ファンド(楽天VTI)", 3000000, 800000, 36.4),
      createHolding("SBI・V・S&P500インデックス・ファンド", 2000000, -200000, -9.1),
    ]);
  },
};

export const NoPctData: Story = {
  name: "損益率なし",
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue([
      createHolding("投資信託A", 2000000, 200000, null),
      createHolding("投資信託B", 1500000, -100000, null),
    ]);
  },
};

export const Empty: Story = {
  name: "データなし",
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue([]);
  },
};

export const MultipleInstitutions: Story = {
  name: "複数の金融機関と種別",
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue([
      // SBI証券 - 投資信託
      createHolding("eMAXIS Slim 全世界株式", 5000000, 1200000, 31.5, "SBI証券", "投資信託"),
      createHolding("eMAXIS Slim 米国株式(S&P500)", 3000000, 800000, 36.4, "SBI証券", "投資信託"),
      // SBI証券 - 株式(現物)
      createHolding("トヨタ自動車", 1000000, 150000, 17.6, "SBI証券", "株式(現物)"),
      createHolding("ソニーグループ", 800000, 100000, 14.3, "SBI証券", "株式(現物)"),
      // 楽天証券 - 投資信託
      createHolding(
        "楽天・全米株式インデックス・ファンド",
        2000000,
        400000,
        25.0,
        "楽天証券",
        "投資信託",
      ),
      createHolding("楽天・オールカントリー", 1500000, -100000, -6.3, "楽天証券", "投資信託"),
      // 楽天証券 - 株式(現物)
      createHolding("任天堂", 600000, 50000, 9.1, "楽天証券", "株式(現物)"),
      // マネックス証券 - 株式(現物)
      createHolding("アップル", 500000, 80000, 19.0, "マネックス証券", "株式(現物)"),
    ]);
  },
};

const mockAccount = {
  id: 1,
  mfId: "abc123",
  groupId: 1,
  name: "SBI証券",
  type: "証券",
  categoryName: "証券",
  institution: "SBI証券",
  status: "ok",
  lastUpdated: "2025-04-26T10:30:00",
  errorMessage: null,
  totalAssets: 15000000,
  createdAt: "2025-04-01T00:00:00Z",
  updatedAt: "2025-04-01T00:00:00Z",
};

export const WithMfId: Story = {
  name: "アカウント指定 (フィルター非表示)",
  args: {
    mfId: "abc123",
  },
  beforeEach() {
    mocked(getAccountByMfId).mockResolvedValue(mockAccount);
    mocked(getHoldingsByAccountId).mockResolvedValue([
      createHolding("eMAXIS Slim 全世界株式", 5000000, 1200000, 31.5, "SBI証券", "投資信託"),
      createHolding("eMAXIS Slim 米国株式(S&P500)", 3000000, 800000, 36.4, "SBI証券", "投資信託"),
      createHolding("トヨタ自動車", 1000000, 150000, 17.6, "SBI証券", "株式(現物)"),
      createHolding("ソニーグループ", 800000, -50000, -5.9, "SBI証券", "株式(現物)"),
    ]);
  },
};
