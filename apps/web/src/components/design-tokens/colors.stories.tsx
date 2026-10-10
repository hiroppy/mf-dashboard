import type { Meta, StoryObj } from "@storybook/nextjs-vite";

type ColorPairProps = {
  pairs: { name: string; bg: string; fg: string }[];
};

function ColorPair({ pairs }: ColorPairProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: "16px",
      }}
    >
      {pairs.map(({ name, bg, fg }) => (
        <div
          key={name}
          style={{
            borderRadius: "8px",
            overflow: "hidden",
            border: "1px solid var(--color-border)",
          }}
        >
          <div
            style={{
              padding: "20px 16px",
              backgroundColor: `var(${bg})`,
              color: `var(${fg})`,
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            <p>{name}</p>
            <p style={{ fontSize: "12px", fontWeight: 400, marginTop: "4px" }}>
              コントラスト検証用テキスト
            </p>
          </div>
          <div style={{ padding: "8px 12px" }}>
            <div
              style={{
                fontSize: "11px",
                color: "var(--color-muted-foreground)",
                fontFamily: "monospace",
              }}
            >
              <div>bg: {bg}</div>
              <div>fg: {fg}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

type ColorSwatchProps = {
  colors: { name: string; variable: string; label?: string }[];
};

function ColorSwatch({ colors }: ColorSwatchProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: "16px",
      }}
    >
      {colors.map(({ name, variable, label }) => (
        <div
          key={name}
          style={{
            borderRadius: "8px",
            overflow: "hidden",
            border: "1px solid var(--color-border)",
          }}
        >
          <div
            style={{
              height: "80px",
              backgroundColor: `var(${variable})`,
            }}
          />
          <div style={{ padding: "8px 12px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600 }}>{label ?? name}</div>
            <div
              style={{
                fontSize: "11px",
                color: "var(--color-muted-foreground)",
                fontFamily: "monospace",
              }}
            >
              {variable}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const pairMeta = {
  title: "Design Token/Colors",
  component: ColorPair,
  tags: ["autodocs"],
} satisfies Meta<typeof ColorPair>;

export default pairMeta;

type PairStory = StoryObj<typeof pairMeta>;
type SwatchStory = StoryObj<Meta<typeof ColorSwatch>>;

type TextColorProps = {
  colors: { name: string; variable: string; label?: string }[];
};

function TextColor({ colors }: TextColorProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: "16px",
      }}
    >
      {colors.map(({ name, variable, label }) => (
        <div
          key={name}
          style={{
            borderRadius: "8px",
            overflow: "hidden",
            border: "1px solid var(--color-border)",
            backgroundColor: "#fff",
          }}
        >
          <div
            style={{
              padding: "20px 16px",
              color: `var(${variable})`,
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            <p>{label ?? name}</p>
            <p style={{ fontSize: "12px", fontWeight: 400, marginTop: "4px" }}>
              コントラスト検証用テキスト
            </p>
          </div>
          <div
            style={{
              padding: "8px 12px",
              borderTop: "1px solid var(--color-border)",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                color: "var(--color-muted-foreground)",
                fontFamily: "monospace",
              }}
            >
              {variable}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

type TextColorStory = StoryObj<Meta<typeof TextColor>>;

export const BaseTheme: PairStory = {
  name: "Base Theme",
  args: {
    pairs: [
      {
        name: "Background",
        bg: "--color-background",
        fg: "--color-foreground",
      },
      {
        name: "Card",
        bg: "--color-card",
        fg: "--color-card-foreground",
      },
      {
        name: "Popover",
        bg: "--color-popover",
        fg: "--color-popover-foreground",
      },
      {
        name: "Primary",
        bg: "--color-primary",
        fg: "--color-primary-foreground",
      },
      {
        name: "Secondary",
        bg: "--color-secondary",
        fg: "--color-secondary-foreground",
      },
      {
        name: "Muted",
        bg: "--color-muted",
        fg: "--color-muted-foreground",
      },
      {
        name: "Accent",
        bg: "--color-accent",
        fg: "--color-accent-foreground",
      },
      {
        name: "Destructive",
        bg: "--color-destructive",
        fg: "--color-destructive-foreground",
      },
    ],
  },
};

export const Chart: SwatchStory = {
  name: "Chart Palette",
  render: (args) => <ColorSwatch {...args} />,
  args: {
    colors: [
      { name: "chart-1", variable: "--color-chart-1" },
      { name: "chart-2", variable: "--color-chart-2" },
      { name: "chart-3", variable: "--color-chart-3" },
      { name: "chart-4", variable: "--color-chart-4" },
      { name: "chart-5", variable: "--color-chart-5" },
    ],
  },
};

export const Semantic: SwatchStory = {
  name: "Semantic",
  render: (args) => <ColorSwatch {...args} />,
  args: {
    colors: [
      { name: "income", variable: "--color-income", label: "収入" },
      { name: "expense", variable: "--color-expense", label: "支出" },
      {
        name: "balance-positive",
        variable: "--color-balance-positive",
        label: "収支プラス",
      },
      {
        name: "balance-negative",
        variable: "--color-balance-negative",
        label: "収支マイナス",
      },
      { name: "transfer", variable: "--color-transfer", label: "振替" },
      {
        name: "total-assets",
        variable: "--color-total-assets",
        label: "総資産",
      },
      { name: "liability", variable: "--color-liability", label: "負債" },
      { name: "net-assets", variable: "--color-net-assets", label: "純資産" },
    ],
  },
};

export const AssetCategory: SwatchStory = {
  name: "Asset Category",
  render: (args) => <ColorSwatch {...args} />,
  args: {
    colors: [
      {
        name: "asset-deposit",
        variable: "--color-asset-deposit",
        label: "預金・現金",
      },
      { name: "asset-stock", variable: "--color-asset-stock", label: "株式" },
      {
        name: "asset-fund",
        variable: "--color-asset-fund",
        label: "投資信託",
      },
      {
        name: "asset-insurance",
        variable: "--color-asset-insurance",
        label: "保険",
      },
      {
        name: "asset-pension",
        variable: "--color-asset-pension",
        label: "年金",
      },
      {
        name: "asset-point",
        variable: "--color-asset-point",
        label: "ポイント",
      },
      {
        name: "asset-fx",
        variable: "--color-asset-fx",
        label: "FX",
      },
    ],
  },
};

export const ExpenseCategory: SwatchStory = {
  name: "Expense Category",
  render: (args) => <ColorSwatch {...args} />,
  args: {
    colors: [
      { name: "cat-food", variable: "--color-cat-food", label: "食費" },
      { name: "cat-daily", variable: "--color-cat-daily", label: "日用品" },
      { name: "cat-housing", variable: "--color-cat-housing", label: "住宅" },
      {
        name: "cat-utility",
        variable: "--color-cat-utility",
        label: "水道・光熱費",
      },
      {
        name: "cat-communication",
        variable: "--color-cat-communication",
        label: "通信費",
      },
      {
        name: "cat-transport",
        variable: "--color-cat-transport",
        label: "交通費",
      },
      {
        name: "cat-automobile",
        variable: "--color-cat-automobile",
        label: "自動車",
      },
      {
        name: "cat-clothing",
        variable: "--color-cat-clothing",
        label: "衣服・美容",
      },
      {
        name: "cat-health",
        variable: "--color-cat-health",
        label: "健康・医療",
      },
      {
        name: "cat-education",
        variable: "--color-cat-education",
        label: "教育・教養",
      },
      {
        name: "cat-entertainment",
        variable: "--color-cat-entertainment",
        label: "趣味・娯楽",
      },
      { name: "cat-social", variable: "--color-cat-social", label: "交際費" },
      {
        name: "cat-special",
        variable: "--color-cat-special",
        label: "特別な支出",
      },
      {
        name: "cat-cash-card",
        variable: "--color-cat-cash-card",
        label: "現金・カード",
      },
      { name: "cat-tax", variable: "--color-cat-tax", label: "税・社会保障" },
      { name: "cat-other", variable: "--color-cat-other", label: "その他" },
      { name: "cat-income", variable: "--color-cat-income", label: "収入" },
      {
        name: "cat-uncategorized",
        variable: "--color-cat-uncategorized",
        label: "未分類",
      },
    ],
  },
};

export const TextColorContrast: TextColorStory = {
  name: "Text Color Contrast",
  render: (args) => <TextColor {...args} />,
  args: {
    colors: [
      { name: "foreground", variable: "--color-foreground" },
      { name: "card-foreground", variable: "--color-card-foreground" },
      { name: "popover-foreground", variable: "--color-popover-foreground" },
      { name: "primary", variable: "--color-primary" },
      {
        name: "secondary-foreground",
        variable: "--color-secondary-foreground",
      },
      { name: "muted-foreground", variable: "--color-muted-foreground" },
      { name: "accent-foreground", variable: "--color-accent-foreground" },
      { name: "destructive", variable: "--color-destructive" },
      { name: "income", variable: "--color-income", label: "収入" },
      { name: "expense", variable: "--color-expense", label: "支出" },
      {
        name: "balance-positive",
        variable: "--color-balance-positive",
        label: "収支プラス",
      },
      {
        name: "balance-negative",
        variable: "--color-balance-negative",
        label: "収支マイナス",
      },
      { name: "transfer", variable: "--color-transfer", label: "振替" },
      {
        name: "total-assets",
        variable: "--color-total-assets",
        label: "総資産",
      },
      { name: "liability", variable: "--color-liability", label: "負債" },
      { name: "net-assets", variable: "--color-net-assets", label: "純資産" },
      {
        name: "asset-deposit",
        variable: "--color-asset-deposit",
        label: "預金・現金",
      },
      { name: "asset-stock", variable: "--color-asset-stock", label: "株式" },
      {
        name: "asset-fund",
        variable: "--color-asset-fund",
        label: "投資信託",
      },
      {
        name: "asset-insurance",
        variable: "--color-asset-insurance",
        label: "保険",
      },
      {
        name: "asset-pension",
        variable: "--color-asset-pension",
        label: "年金",
      },
      {
        name: "asset-point",
        variable: "--color-asset-point",
        label: "ポイント",
      },
      {
        name: "asset-fx",
        variable: "--color-asset-fx",
        label: "FX",
      },
      { name: "cat-food", variable: "--color-cat-food", label: "食費" },
      { name: "cat-daily", variable: "--color-cat-daily", label: "日用品" },
      { name: "cat-housing", variable: "--color-cat-housing", label: "住宅" },
      {
        name: "cat-utility",
        variable: "--color-cat-utility",
        label: "水道・光熱費",
      },
      {
        name: "cat-communication",
        variable: "--color-cat-communication",
        label: "通信費",
      },
      {
        name: "cat-transport",
        variable: "--color-cat-transport",
        label: "交通費",
      },
      {
        name: "cat-automobile",
        variable: "--color-cat-automobile",
        label: "自動車",
      },
      {
        name: "cat-clothing",
        variable: "--color-cat-clothing",
        label: "衣服・美容",
      },
      {
        name: "cat-health",
        variable: "--color-cat-health",
        label: "健康・医療",
      },
      {
        name: "cat-education",
        variable: "--color-cat-education",
        label: "教育・教養",
      },
      {
        name: "cat-entertainment",
        variable: "--color-cat-entertainment",
        label: "趣味・娯楽",
      },
      { name: "cat-social", variable: "--color-cat-social", label: "交際費" },
      {
        name: "cat-special",
        variable: "--color-cat-special",
        label: "特別な支出",
      },
      {
        name: "cat-cash-card",
        variable: "--color-cat-cash-card",
        label: "現金・カード",
      },
      { name: "cat-tax", variable: "--color-cat-tax", label: "税・社会保障" },
      { name: "cat-other", variable: "--color-cat-other", label: "その他" },
      { name: "cat-income", variable: "--color-cat-income", label: "収入" },
      {
        name: "cat-uncategorized",
        variable: "--color-cat-uncategorized",
        label: "未分類",
      },
    ],
  },
};
