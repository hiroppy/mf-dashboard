import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getAccountByMfId } from "@mf-dashboard/db";
import { getHoldingsByAccountId, getHoldingsWithLatestValues } from "@mf-dashboard/db";
import { getLatestMonthlySummary } from "@mf-dashboard/db";
import { expect, mocked, userEvent, within } from "storybook/test";
import { HoldingsTable } from "./holdings-table";

// テスト用ビューポート設定
const pcViewport = { viewport: { value: "desktop", isRotated: false } };
const mobileViewport = { viewport: { value: "iphone14", isRotated: false } };

const meta = {
  title: "Info/HoldingsTable",
  component: HoldingsTable,
  tags: ["autodocs"],
  // Workaround for https://github.com/storybookjs/storybook/issues/32057
  // デフォルトでレスポンシブに戻す（前のストーリーのビューポートを引き継がない）
  globals: {
    viewport: { value: undefined, isRotated: false },
  },
} satisfies Meta<typeof HoldingsTable>;

export default meta;
type Story = StoryObj<typeof meta>;

const summaryMock = {
  id: 1,
  groupId: "test_group_001",
  month: "2025-04",
  totalIncome: 350000,
  totalExpense: 220000,
  netIncome: 130000,
  totalAssets: 15000000,
  totalLiabilities: 2000000,
  netAssets: 13000000,
  createdAt: "2025-04-01T00:00:00Z",
  updatedAt: "2025-04-01T00:00:00Z",
};

const assetHoldings = [
  {
    id: 1,
    name: "サンプル投資信託A",
    type: "asset",
    liabilityCategory: null,
    categoryId: 1,
    categoryName: "投資信託",
    accountId: 1,
    accountName: "サンプル証券 (口座A)",
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
    name: "サンプル投資信託B",
    type: "asset",
    liabilityCategory: null,
    categoryId: 1,
    categoryName: "投資信託",
    accountId: 1,
    accountName: "サンプル証券 (口座A)",
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
    name: "サンプル投資信託C",
    type: "asset",
    liabilityCategory: null,
    categoryId: 1,
    categoryName: "投資信託",
    accountId: 2,
    accountName: "サンプル証券 (口座B)",
    institution: "サンプル証券",
    amount: 2000000,
    quantity: 10000,
    unitPrice: 200,
    avgCostPrice: 180,
    dailyChange: 10000,
    unrealizedGain: 200000,
    unrealizedGainPct: 11.1,
  },
  {
    id: 4,
    name: "サンプル銀行A",
    type: "asset",
    liabilityCategory: null,
    categoryId: 2,
    categoryName: "預金・現金・暗号資産",
    accountId: 3,
    accountName: "サンプル銀行A",
    institution: "サンプル銀行A",
    amount: 3000000,
    quantity: null,
    unitPrice: null,
    avgCostPrice: null,
    dailyChange: null,
    unrealizedGain: null,
    unrealizedGainPct: null,
  },
  {
    id: 5,
    name: "サンプル銀行B",
    type: "asset",
    liabilityCategory: null,
    categoryId: 2,
    categoryName: "預金・現金・暗号資産",
    accountId: 4,
    accountName: "サンプル銀行B",
    institution: "サンプル銀行B",
    amount: 2000000,
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
    name: "住宅ローン",
    type: "liability",
    liabilityCategory: "住宅ローン",
    categoryId: null,
    categoryName: null,
    accountId: 5,
    accountName: "サンプル銀行A",
    institution: "サンプル銀行A",
    amount: 1500000,
    quantity: null,
    unitPrice: null,
    avgCostPrice: null,
    dailyChange: null,
    unrealizedGain: null,
    unrealizedGainPct: null,
  },
  {
    id: 11,
    name: "カードローン",
    type: "liability",
    liabilityCategory: "カードローン",
    categoryId: null,
    categoryName: null,
    accountId: 6,
    accountName: "サンプルカード",
    institution: "サンプルカード",
    amount: 500000,
    quantity: null,
    unitPrice: null,
    avgCostPrice: null,
    dailyChange: null,
    unrealizedGain: null,
    unrealizedGainPct: null,
  },
];

export const Empty: Story = {
  args: { type: "asset" },
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue([]);
    mocked(getLatestMonthlySummary).mockResolvedValue(undefined);
  },
};

export const Asset: Story = {
  args: { type: "asset" },
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue(assetHoldings);
    mocked(getLatestMonthlySummary).mockResolvedValue(summaryMock);
  },
};

export const Liability: Story = {
  args: { type: "liability" },
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue(liabilityHoldings);
    mocked(getLatestMonthlySummary).mockResolvedValue(summaryMock);
  },
};

export const ManyHoldings: Story = {
  args: { type: "asset" },
  beforeEach() {
    const manyFunds = Array.from({ length: 12 }, (_, i) => ({
      id: 100 + i,
      name: `インデックスファンド ${String.fromCharCode(65 + i)}`,
      type: "asset" as const,
      liabilityCategory: null,
      categoryId: 1,
      categoryName: "投資信託",
      accountId: 1,
      accountName: "サンプル証券",
      institution: "サンプル証券",
      amount: 5000000 - i * 300000,
      quantity: 10000,
      unitPrice: 200,
      avgCostPrice: 400 - i * 20,
      dailyChange: 50000 - i * 10000,
      unrealizedGain: 1000000 - i * 100000,
      unrealizedGainPct: 25 - i * 2,
    }));
    mocked(getHoldingsWithLatestValues).mockResolvedValue(manyFunds);
    mocked(getLatestMonthlySummary).mockResolvedValue(summaryMock);
  },
};

export const SingleHolding: Story = {
  args: { type: "asset" },
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue([assetHoldings[0]]);
    mocked(getLatestMonthlySummary).mockResolvedValue(summaryMock);
  },
};

export const WithLosses: Story = {
  args: { type: "asset" },
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue([
      { ...assetHoldings[0], unrealizedGain: -500000, unrealizedGainPct: -10 },
      {
        ...assetHoldings[1],
        unrealizedGain: -200000,
        unrealizedGainPct: -6.5,
      },
      { ...assetHoldings[2], unrealizedGain: 50000, unrealizedGainPct: 2.8 },
    ]);
    mocked(getLatestMonthlySummary).mockResolvedValue(summaryMock);
  },
};

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

export const WithMfId: Story = {
  name: "アカウント指定 (金融機関名非表示)",
  args: { type: "asset", mfId: "abc123" },
  beforeEach() {
    mocked(getAccountByMfId).mockResolvedValue(mockAccount);
    mocked(getHoldingsByAccountId).mockResolvedValue(
      assetHoldings.map((h) => ({
        ...h,
        accountName: mockAccount.name,
      })),
    );
  },
};

// 含み損益なしの資産のみ（預金など）
const depositOnlyHoldings = [
  {
    id: 4,
    name: "サンプル銀行A",
    type: "asset" as const,
    liabilityCategory: null,
    categoryId: 2,
    categoryName: "預金・現金・暗号資産",
    accountId: 3,
    accountName: "サンプル銀行A",
    institution: "サンプル銀行A",
    amount: 3000000,
    quantity: null,
    unitPrice: null,
    avgCostPrice: null,
    dailyChange: null,
    unrealizedGain: null,
    unrealizedGainPct: null,
  },
  {
    id: 5,
    name: "サンプル銀行B",
    type: "asset" as const,
    liabilityCategory: null,
    categoryId: 2,
    categoryName: "預金・現金・暗号資産",
    accountId: 4,
    accountName: "サンプル銀行B",
    institution: "サンプル銀行B",
    amount: 2000000,
    quantity: null,
    unitPrice: null,
    avgCostPrice: null,
    dailyChange: null,
    unrealizedGain: null,
    unrealizedGainPct: null,
  },
];

export const DepositOnly: Story = {
  name: "預金のみ（含み損益なし）",
  args: { type: "asset" },
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue(depositOnlyHoldings);
    mocked(getLatestMonthlySummary).mockResolvedValue(summaryMock);
  },
};

// === PC vs モバイル 割合表示テスト ===
// PC: 金額横に%がインライン表示 (hidden sm:inline-block)
// モバイル: 投信/株はグリッド内に「割合」、預金等はアコーディオン内に「割合」

export const AssetPC: Story = {
  name: "資産 割合表示 (PC)",
  args: { type: "asset" },
  globals: pcViewport,
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue(assetHoldings);
    mocked(getLatestMonthlySummary).mockResolvedValue(summaryMock);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // 投信/株の詳細グリッドが表示される（含み損益、評価損益率、前日比）
    await expect(canvas.getAllByText("含み損益").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("評価損益率").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("前日比").length).toBeGreaterThan(0);

    // 投資信託の項目が表示される
    await expect(canvas.getByRole("button", { name: /サンプル投資信託A/ })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /サンプル投資信託B/ })).toBeInTheDocument();

    // 「割合」ラベルは投信の詳細グリッド内に存在する（モバイル専用表示だがDOM上には存在）
    const ratioLabels = canvas.queryAllByText("割合");
    await expect(ratioLabels.length).toBeGreaterThan(0);
  },
};

export const AssetMobile: Story = {
  name: "資産 割合表示 (モバイル)",
  args: { type: "asset" },
  globals: mobileViewport,
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue(assetHoldings);
    mocked(getLatestMonthlySummary).mockResolvedValue(summaryMock);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // モバイル版: 投信/株の詳細グリッドが表示される
    await expect(canvas.getAllByText("含み損益").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("評価損益率").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("前日比").length).toBeGreaterThan(0);

    // モバイル版: 投信/株では「割合」がグリッド内に表示される（sm:hidden）
    await expect(canvas.getAllByText("割合").length).toBeGreaterThan(0);
  },
};

export const DepositOnlyPC: Story = {
  name: "預金のみ 割合表示 (PC)",
  args: { type: "asset" },
  globals: pcViewport,
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue(depositOnlyHoldings);
    mocked(getLatestMonthlySummary).mockResolvedValue(summaryMock);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // PC版: 預金は含み損益グリッドが表示されない
    await expect(canvas.queryByText("含み損益")).not.toBeInTheDocument();
    await expect(canvas.queryByText("評価損益率")).not.toBeInTheDocument();
    await expect(canvas.queryByText("前日比")).not.toBeInTheDocument();

    // PC版: 金額横に%が表示されている（例: 60.0%, 40.0%）
    await expect(canvas.getByText("60.0%")).toBeInTheDocument();
    await expect(canvas.getByText("40.0%")).toBeInTheDocument();

    // 預金は展開前は「割合」ラベルがDOMに存在しない（展開時のみ追加される）
  },
};

export const DepositOnlyMobile: Story = {
  name: "預金のみ 割合表示 (モバイル)",
  args: { type: "asset" },
  globals: {
    ...mobileViewport,
  },
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue(depositOnlyHoldings);
    mocked(getLatestMonthlySummary).mockResolvedValue(summaryMock);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // モバイル版: 預金は含み損益グリッドが表示されない
    await expect(canvas.queryByText("含み損益")).not.toBeInTheDocument();

    // モバイル版: 預金では展開前は「割合」ラベルが表示されない
    // （PCでは金額横に%表示、モバイルではアコーディオン展開時のみ）
    await expect(canvas.queryByText("割合")).not.toBeInTheDocument();
  },
};

export const LiabilityPC: Story = {
  name: "負債 割合表示 (PC)",
  args: { type: "liability" },
  globals: pcViewport,
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue(liabilityHoldings);
    mocked(getLatestMonthlySummary).mockResolvedValue(summaryMock);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // 負債は含み損益グリッドが表示されない
    await expect(canvas.queryByText("含み損益")).not.toBeInTheDocument();

    // 負債項目が表示される
    await expect(canvas.getByRole("button", { name: /住宅ローン/ })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /カードローン/ })).toBeInTheDocument();

    // 負債は展開前は「割合」ラベルがDOMに存在しない（展開時のみ追加される）
    await expect(canvas.queryByText("割合")).not.toBeInTheDocument();
  },
};

export const LiabilityMobile: Story = {
  name: "負債 割合表示 (モバイル)",
  args: { type: "liability" },
  globals: {
    ...mobileViewport,
  },
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue(liabilityHoldings);
    mocked(getLatestMonthlySummary).mockResolvedValue(summaryMock);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // モバイル版: 負債は含み損益グリッドが表示されない
    await expect(canvas.queryByText("含み損益")).not.toBeInTheDocument();

    // モバイル版: 展開前は「割合」ラベルが表示されない
    await expect(canvas.queryByText("割合")).not.toBeInTheDocument();
  },
};

// === アコーディオン展開テスト ===
// 投信/株（含み損益あり）: 展開時に平均取得単価、数量、現在単価、保有金融機関が表示
// 預金/負債（含み損益なし）: 展開時に割合（モバイルのみ）と保有金融機関が表示

export const AssetExpanded: Story = {
  name: "投信 アコーディオン展開 (PC)",
  args: { type: "asset" },
  globals: pcViewport,
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue(assetHoldings);
    mocked(getLatestMonthlySummary).mockResolvedValue(summaryMock);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const firstHolding = canvas.getByRole("button", { name: /サンプル投資信託A/ });
    await userEvent.click(firstHolding);

    // 投信: 展開時に詳細情報がグリッド表示される
    await expect(canvas.getByText("平均取得単価")).toBeInTheDocument();
    await expect(canvas.getByText("数量")).toBeInTheDocument();
    await expect(canvas.getByText("現在単価")).toBeInTheDocument();
    await expect(canvas.getByText("保有金融機関")).toBeInTheDocument();
    await expect(canvas.getByText("サンプル証券 (口座A)")).toBeInTheDocument();

    // 投信では「割合」ラベルが存在する（モバイル専用表示だがDOM上には存在）
    const ratioLabels = canvas.queryAllByText("割合");
    await expect(ratioLabels.length).toBeGreaterThan(0);
  },
};

export const AssetExpandedMobile: Story = {
  name: "投信 アコーディオン展開 (モバイル)",
  args: { type: "asset" },
  globals: {
    ...mobileViewport,
  },
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue(assetHoldings);
    mocked(getLatestMonthlySummary).mockResolvedValue(summaryMock);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const firstHolding = canvas.getByRole("button", { name: /サンプル投資信託A/ });
    await userEvent.click(firstHolding);

    // 投信: 展開時に詳細情報がグリッド表示される
    await expect(canvas.getByText("平均取得単価")).toBeInTheDocument();
    await expect(canvas.getByText("数量")).toBeInTheDocument();
    await expect(canvas.getByText("現在単価")).toBeInTheDocument();
    await expect(canvas.getByText("保有金融機関")).toBeInTheDocument();

    // モバイル: 投信では「割合」は常時グリッド内に表示されている（展開前から）
    await expect(canvas.getAllByText("割合").length).toBeGreaterThan(0);
  },
};

export const DepositExpandedPC: Story = {
  name: "預金 アコーディオン展開 (PC)",
  args: { type: "asset" },
  globals: pcViewport,
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue(depositOnlyHoldings);
    mocked(getLatestMonthlySummary).mockResolvedValue(summaryMock);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const firstDeposit = canvas.getByRole("button", { name: /サンプル銀行A/ });
    await userEvent.click(firstDeposit);

    // 預金: 展開時に保有金融機関が表示される
    await expect(canvas.getByText("保有金融機関")).toBeInTheDocument();
    // 複数の「サンプル銀行A」があるためgetAllByTextを使用
    await expect(canvas.getAllByText("サンプル銀行A").length).toBeGreaterThan(0);

    // 預金: 展開時に「割合」ラベルが存在する（モバイル専用表示だがDOM上には存在）
    const ratioLabels = canvas.queryAllByText("割合");
    await expect(ratioLabels.length).toBeGreaterThan(0);

    // 投信の詳細項目は表示されない
    await expect(canvas.queryByText("平均取得単価")).not.toBeInTheDocument();
    await expect(canvas.queryByText("数量")).not.toBeInTheDocument();
    await expect(canvas.queryByText("現在単価")).not.toBeInTheDocument();
  },
};

export const DepositExpandedMobile: Story = {
  name: "預金 アコーディオン展開 (モバイル)",
  args: { type: "asset" },
  globals: {
    ...mobileViewport,
  },
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue(depositOnlyHoldings);
    mocked(getLatestMonthlySummary).mockResolvedValue(summaryMock);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const firstDeposit = canvas.getByRole("button", { name: /サンプル銀行A/ });
    await userEvent.click(firstDeposit);

    // モバイル: 預金展開時は「割合」と保有金融機関が表示される
    await expect(canvas.getByText("割合")).toBeInTheDocument();
    await expect(canvas.getByText("保有金融機関")).toBeInTheDocument();

    // 投信の詳細項目は表示されない
    await expect(canvas.queryByText("平均取得単価")).not.toBeInTheDocument();
    await expect(canvas.queryByText("数量")).not.toBeInTheDocument();
  },
};

export const LiabilityExpanded: Story = {
  name: "負債 アコーディオン展開 (PC)",
  args: { type: "liability" },
  globals: pcViewport,
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue(liabilityHoldings);
    mocked(getLatestMonthlySummary).mockResolvedValue(summaryMock);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const firstLiability = canvas.getByRole("button", { name: /住宅ローン/ });
    await userEvent.click(firstLiability);

    // 負債: 展開時に保有金融機関が表示される
    await expect(canvas.getByText("保有金融機関")).toBeInTheDocument();
    await expect(canvas.getByText("サンプル銀行A")).toBeInTheDocument();

    // 負債: 展開時に「割合」ラベルが存在する（モバイル専用表示だがDOM上には存在）
    const ratioLabels = canvas.queryAllByText("割合");
    await expect(ratioLabels.length).toBeGreaterThan(0);
  },
};

export const LiabilityExpandedMobile: Story = {
  name: "負債 アコーディオン展開 (モバイル)",
  args: { type: "liability" },
  globals: mobileViewport,
  beforeEach() {
    mocked(getHoldingsWithLatestValues).mockResolvedValue(liabilityHoldings);
    mocked(getLatestMonthlySummary).mockResolvedValue(summaryMock);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const firstLiability = canvas.getByRole("button", { name: /住宅ローン/ });
    await userEvent.click(firstLiability);

    // モバイル: 負債展開時は「割合」と保有金融機関が表示される
    await expect(canvas.getByText("割合")).toBeInTheDocument();
    await expect(canvas.getByText("保有金融機関")).toBeInTheDocument();
    await expect(canvas.getByText("サンプル銀行A")).toBeInTheDocument();
  },
};
