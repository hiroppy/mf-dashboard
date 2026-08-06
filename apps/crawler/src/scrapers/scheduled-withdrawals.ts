import type { RegisteredAccounts } from "@mf-dashboard/db/types";
import type { Page } from "playwright";
import { parseJapaneseNumber } from "../parsers.js";

const WITHDRAWAL_SUMMARY_PREFIXES = ["引き落とし予定額：", "引き落とし予定額合計："];

export interface ScheduledWithdrawalStatus {
  amount: number;
  confirmed: boolean;
}

export function parseScheduledWithdrawalSummary(
  text: string,
): ScheduledWithdrawalStatus | undefined {
  const normalized = text.trim();
  const prefix = WITHDRAWAL_SUMMARY_PREFIXES.find((label) => normalized.startsWith(label));
  if (!prefix) return undefined;

  const value = normalized.slice(prefix.length).trim().normalize("NFKC");
  if (!/\d/u.test(value)) return { amount: 0, confirmed: false };
  return { amount: Math.max(0, parseJapaneseNumber(value)), confirmed: true };
}

export async function getScheduledWithdrawalStatus(
  page: Page,
): Promise<ScheduledWithdrawalStatus | undefined> {
  const summaries = await page.locator("h1.heading-small").allTextContents();
  return summaries.map(parseScheduledWithdrawalSummary).find((status) => status !== undefined);
}

export function applyScheduledWithdrawals(
  registeredAccounts: RegisteredAccounts,
  statuses: ReadonlyMap<string, ScheduledWithdrawalStatus>,
): RegisteredAccounts {
  return {
    accounts: registeredAccounts.accounts.map((account) => {
      const status = statuses.get(account.mfId);
      return status
        ? {
            ...account,
            scheduledWithdrawalAmount: status.amount,
            scheduledWithdrawalConfirmed: status.confirmed,
          }
        : {
            ...account,
            scheduledWithdrawalAmount: 0,
            scheduledWithdrawalConfirmed: false,
          };
    }),
  };
}
