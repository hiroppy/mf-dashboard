export const pages = [
  { name: "Dashboard", path: "/", heading: "ダッシュボード" },
  { name: "Accounts", path: "/accounts", heading: "連携サービス一覧" },
  {
    name: "Account demo_000001",
    path: "/accounts/demo_000001",
    heading: "三井住友銀行",
  },
  {
    name: "Account demo_000004",
    path: "/accounts/demo_000004",
    heading: "ゆうちょ銀行（貯蓄用）",
  },
  {
    name: "Account demo_000006",
    path: "/accounts/demo_000006",
    heading: "楽天証券",
  },
  { name: "Balance Sheet", path: "/bs", heading: "資産" },
  { name: "Cash Flow", path: "/cf", heading: "収支" },
  { name: "Cash Flow (monthly)", path: "/cf/2025-12", heading: "収支 - 2025年12月" },
  { name: "Simulator", path: "/simulator", heading: "シミュレーター" },
  { name: "Insights", path: "/insights", heading: "財務インサイト" },
  {
    name: "Group dashboard",
    path: "/demo_group_001",
    heading: "ダッシュボード",
  },
  {
    name: "Group accounts",
    path: "/demo_group_001/accounts",
    heading: "連携サービス一覧",
  },
  {
    name: "Group account",
    path: "/demo_group_001/accounts/demo_000005",
    heading: "SBI証券",
  },
  { name: "Group balance sheet", path: "/demo_group_001/bs", heading: "資産" },
  { name: "Group cash flow", path: "/demo_group_001/cf", heading: "収支" },
  {
    name: "Group cash flow (monthly)",
    path: "/demo_group_001/cf/2025-12",
    heading: "収支 - 2025年12月",
  },
  {
    name: "Group insights",
    path: "/demo_group_001/insights",
    heading: "財務インサイト",
  },
  {
    name: "Group simulator",
    path: "/demo_group_001/simulator",
    heading: "シミュレーター",
  },
] as const;
