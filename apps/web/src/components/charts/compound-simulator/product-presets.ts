export const PRODUCT_PRESETS = [
  { value: "custom", label: "カスタム" },
  {
    value: "all-country",
    label: "オルカン",
    annualReturnRate: 7.5,
    expenseRatio: 0.05775,
    volatility: 15,
  },
  {
    value: "sp500",
    label: "S&P 500",
    annualReturnRate: 10,
    expenseRatio: 0.0814,
    volatility: 18,
  },
  {
    value: "qqq",
    label: "QQQ",
    annualReturnRate: 12,
    expenseRatio: 0.2,
    volatility: 22,
  },
  {
    value: "nikkei225",
    label: "日経平均",
    annualReturnRate: 7.5,
    expenseRatio: 0.143,
    volatility: 20,
  },
  {
    value: "topix",
    label: "TOPIX",
    annualReturnRate: 6,
    expenseRatio: 0.143,
    volatility: 18,
  },
] as const;
