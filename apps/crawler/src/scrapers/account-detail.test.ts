import { describe, expect, test } from "vitest";
import { extractAccountMfIdFromDetailUrl, isExpectedAccountDetailPage } from "./account-detail.js";

describe("extractAccountMfIdFromDetailUrl", () => {
  test.each([
    ["/accounts/show/account-a", "show", "account-a"],
    ["https://moneyforward.com/accounts/show/account%20a", "show", "account a"],
    ["/accounts/show_manual/manual-account-a?tab=assets", "show_manual", "manual-account-a"],
  ] as const)("正しい詳細URLから口座IDを取り出す", (href, type, expected) => {
    expect(extractAccountMfIdFromDetailUrl(href, type)).toBe(expected);
  });

  test.each([
    ["/accounts/show_manual/manual-account-a", "show"],
    ["/accounts/show/account-a/extra", "show"],
    ["/accounts/edit/account-a", "show"],
    ["not a valid URL", "show"],
  ] as const)("異なる画面種別や不正なURLを拒否する", (href, type) => {
    expect(extractAccountMfIdFromDetailUrl(href, type)).toBeNull();
  });
});

describe("isExpectedAccountDetailPage", () => {
  test.each([
    [true, "https://moneyforward.com/accounts/show/account-a", "/accounts/show/account-a", true],
    [false, "https://moneyforward.com/accounts/show/account-a", "/accounts/show/account-a", false],
    [true, "https://moneyforward.com/", "/accounts/show/account-a", false],
  ] as const)(
    "レスポンス状態と最終URLの両方で遷移結果を判定する",
    (responseOk, currentUrl, expectedPath, expected) => {
      expect(isExpectedAccountDetailPage(responseOk, currentUrl, expectedPath)).toBe(expected);
    },
  );
});
