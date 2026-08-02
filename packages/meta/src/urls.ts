const BASE_URL = "https://moneyforward.com";
const ID_BASE_URL = "https://id.moneyforward.com";

export const mfUrls = {
  /** トップページ */
  home: `${BASE_URL}/`,
  /** 家計簿（収支詳細） */
  cashFlow: `${BASE_URL}/cf`,
  /** 家計簿（月次収支） */
  monthlyCashFlow: `${BASE_URL}/cf/monthly`,
  /** 資産推移 */
  assetHistory: `${BASE_URL}/bs/history`,
  /** ポートフォリオ */
  portfolio: `${BASE_URL}/bs/portfolio`,
  /** 負債 */
  liability: `${BASE_URL}/bs/liability`,
  /** 口座一覧 */
  accounts: `${BASE_URL}/accounts`,
  /** 予算 */
  spendingTargets: `${BASE_URL}/spending_targets/edit`,
  /** カテゴリ設定 */
  categoryRules: `${BASE_URL}/profile/rule`,
  /** ME ログイン */
  signIn: `${BASE_URL}/sign_in`,

  auth: {
    /** MFID ログインページ */
    signIn: `${ID_BASE_URL}/sign_in`,
    /** MFID パスワード入力ページ */
    password: `${ID_BASE_URL}/sign_in/password`,
  },

  /** 口座詳細ページURL を生成 */
  accountDetail(mfId: string, type: "show" | "show_manual" = "show"): string {
    return `${BASE_URL}/accounts/${type}/${mfId}`;
  },

  /** 指定月の家計簿URL を生成 (from/to は YYYY/MM/DD 形式) */
  cashFlowWithRange(from: string, to: string): string {
    return `${BASE_URL}/cf?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  },
} as const;
