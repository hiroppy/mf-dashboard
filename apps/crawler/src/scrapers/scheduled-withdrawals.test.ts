import { describe, expect, it } from "vitest";
import {
  applyScheduledWithdrawals,
  parseScheduledWithdrawalSummary,
} from "./scheduled-withdrawals.js";

describe("parseScheduledWithdrawalSummary", () => {
  it.each([
    ["引き落とし予定額：42,000円", { amount: 42_000, confirmed: true }],
    [" 引き落とし予定額： １２，０００円 ", { amount: 12_000, confirmed: true }],
    ["引き落とし予定額：未定", { amount: 0, confirmed: false }],
    ["利用残高：42,000円", undefined],
  ])("合計見出し %s を解析する", (text, expected) => {
    expect(parseScheduledWithdrawalSummary(text)).toEqual(expected);
  });
});

it("取得した予定額を対応する口座だけに反映する", () => {
  const account = {
    mfId: "account-a",
    name: "Institution A",
    type: "自動連携",
    status: "ok" as const,
    lastUpdated: "",
    url: "/accounts/show/account-a",
    totalAssets: 0,
  };

  expect(
    applyScheduledWithdrawals(
      { accounts: [account, { ...account, mfId: "account-b" }] },
      new Map([["account-a", { amount: 20_000, confirmed: true }]]),
    ),
  ).toEqual({
    accounts: [
      { ...account, scheduledWithdrawalAmount: 20_000, scheduledWithdrawalConfirmed: true },
      {
        ...account,
        mfId: "account-b",
        scheduledWithdrawalAmount: 0,
        scheduledWithdrawalConfirmed: false,
      },
    ],
  });
});

it("今回確認できなかった古い予定額を未確定へ戻す", () => {
  const account = {
    mfId: "account-a",
    name: "Institution A",
    type: "自動連携",
    status: "ok" as const,
    lastUpdated: "",
    url: "/accounts/show/account-a",
    totalAssets: 0,
    scheduledWithdrawalAmount: 42_000,
    scheduledWithdrawalConfirmed: true,
  };

  expect(applyScheduledWithdrawals({ accounts: [account] }, new Map()).accounts[0]).toMatchObject({
    scheduledWithdrawalAmount: 0,
    scheduledWithdrawalConfirmed: false,
  });
});
