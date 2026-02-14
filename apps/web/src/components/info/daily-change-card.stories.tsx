import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getHoldingsWithDailyChange } from "@mf-dashboard/db";
import { mocked } from "storybook/test";
import { DailyChangeCard } from "./daily-change-card";

const meta = {
  title: "Info/DailyChangeCard",
  component: DailyChangeCard,
  tags: ["autodocs"],
} satisfies Meta<typeof DailyChangeCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const createHolding = (
  name: string,
  dailyChange: number,
  code: string | null = null,
  categoryName = "投資信託",
  accountName = "SBI証券",
) => ({
  id: Math.random(),
  name,
  code,
  categoryName,
  accountName,
  dailyChange,
});

export const Mixed: Story = {
  name: "上昇と下落の混合",
  beforeEach() {
    mocked(getHoldingsWithDailyChange).mockResolvedValue([
      createHolding("eMAXIS Slim 全世界株式(オール・カントリー)", 15000),
      createHolding("eMAXIS Slim 米国株式(S&P500)", 12000),
      createHolding("楽天・全米株式インデックス・ファンド", 8500),
      createHolding("SBI・V・S&P500インデックス・ファンド", 5200),
      createHolding("たわらノーロード 先進国株式", 3800),
      createHolding("トヨタ自動車", 2500, "7203", "株式(現物)"),
      createHolding("日本株ファンド", -8000),
      createHolding("新興国株式インデックス", -12500),
      createHolding("不動産投資信託", -6000),
      createHolding("コモディティファンド", -3500),
      createHolding("ソニーグループ", -15000, "6758", "株式(現物)"),
    ]);
  },
};

export const AllPositive: Story = {
  name: "全て上昇",
  beforeEach() {
    mocked(getHoldingsWithDailyChange).mockResolvedValue([
      createHolding("eMAXIS Slim 全世界株式", 25000),
      createHolding("eMAXIS Slim 米国株式(S&P500)", 18000),
      createHolding("楽天・全米株式インデックス・ファンド", 12000),
      createHolding("SBI・V・S&P500", 8000),
      createHolding("たわらノーロード 先進国株式", 5000),
      createHolding("ニッセイ外国株式", 3000),
      createHolding("トヨタ自動車", 2000, "7203", "株式(現物)"),
    ]);
  },
};

export const AllNegative: Story = {
  name: "全て下落",
  beforeEach() {
    mocked(getHoldingsWithDailyChange).mockResolvedValue([
      createHolding("日本株ファンド", -25000),
      createHolding("新興国株式インデックス", -18000),
      createHolding("不動産投資信託", -12000),
      createHolding("コモディティファンド", -8000),
      createHolding("国内債券ファンド", -5000),
      createHolding("ソニーグループ", -3000, "6758", "株式(現物)"),
    ]);
  },
};

export const FewHoldings: Story = {
  name: "少数の銘柄",
  beforeEach() {
    mocked(getHoldingsWithDailyChange).mockResolvedValue([
      createHolding("eMAXIS Slim 全世界株式", 15000),
      createHolding("日本株ファンド", -8000),
    ]);
  },
};

export const SingleGainer: Story = {
  name: "上昇のみ1銘柄",
  beforeEach() {
    mocked(getHoldingsWithDailyChange).mockResolvedValue([
      createHolding("eMAXIS Slim 全世界株式", 50000),
    ]);
  },
};

export const SingleLoser: Story = {
  name: "下落のみ1銘柄",
  beforeEach() {
    mocked(getHoldingsWithDailyChange).mockResolvedValue([createHolding("日本株ファンド", -30000)]);
  },
};

export const LongNames: Story = {
  name: "長い銘柄名",
  beforeEach() {
    mocked(getHoldingsWithDailyChange).mockResolvedValue([
      createHolding("eMAXIS Slim 全世界株式(オール・カントリー)除く日本", 20000),
      createHolding("楽天・全米株式インデックス・ファンド(楽天・VTI)", 15000),
      createHolding("SBI・V・S&P500インデックス・ファンド(愛称:SBI・V・S&P500)", 10000),
      createHolding("ニッセイ外国株式インデックスファンド", -8000),
      createHolding("たわらノーロード 先進国株式<為替ヘッジあり>", -12000),
    ]);
  },
};

export const ManyHoldings: Story = {
  name: "多数の銘柄",
  beforeEach() {
    mocked(getHoldingsWithDailyChange).mockResolvedValue([
      // 上昇銘柄 (TOP5より多い)
      createHolding("銘柄A", 50000),
      createHolding("銘柄B", 40000),
      createHolding("銘柄C", 30000),
      createHolding("銘柄D", 20000),
      createHolding("銘柄E", 15000),
      createHolding("銘柄F", 10000),
      createHolding("銘柄G", 5000),
      // 下落銘柄 (TOP5より多い)
      createHolding("銘柄H", -50000),
      createHolding("銘柄I", -40000),
      createHolding("銘柄J", -30000),
      createHolding("銘柄K", -20000),
      createHolding("銘柄L", -15000),
      createHolding("銘柄M", -10000),
      createHolding("銘柄N", -5000),
    ]);
  },
};

export const SmallChanges: Story = {
  name: "小さな変動",
  beforeEach() {
    mocked(getHoldingsWithDailyChange).mockResolvedValue([
      createHolding("eMAXIS Slim 全世界株式", 500),
      createHolding("楽天・全米株式", 300),
      createHolding("SBI・V・S&P500", 100),
      createHolding("日本株ファンド", -200),
      createHolding("新興国株式", -400),
    ]);
  },
};

export const LargeChanges: Story = {
  name: "大きな変動",
  beforeEach() {
    mocked(getHoldingsWithDailyChange).mockResolvedValue([
      createHolding("eMAXIS Slim 全世界株式", 500000),
      createHolding("楽天・全米株式", 350000),
      createHolding("SBI・V・S&P500", 200000),
      createHolding("日本株ファンド", -180000),
      createHolding("新興国株式", -250000),
    ]);
  },
};

export const Empty: Story = {
  name: "データなし",
  beforeEach() {
    mocked(getHoldingsWithDailyChange).mockResolvedValue([]);
  },
};
