import type { RegisteredAccounts } from "@mf-dashboard/db/types";
import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Locator, Page } from "playwright";
import { debug, warn } from "../logger.js";

export interface ManualHoldingReference {
  holdingMfId: string;
  subAccountMfId: string;
  accountMfId: string;
}

export type ManualHoldingAccountMap = ReadonlyMap<string, string>;

const MANUAL_ACCOUNT_PATH_PATTERN = /^\/accounts\/show_manual\/([^/]+)$/;
const INPUT_TIMEOUT = 1000;

export function createManualHoldingKey(holdingMfId: string, subAccountMfId: string): string {
  return JSON.stringify([holdingMfId, subAccountMfId]);
}

function extractManualAccountMfId(href: string): string | null {
  try {
    const pathname = new URL(href, mfUrls.home).pathname;
    const match = pathname.match(MANUAL_ACCOUNT_PATH_PATTERN);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

async function getInputValue(row: Locator, name: string): Promise<string> {
  return row
    .locator(`input[name="${name}"]`)
    .first()
    .inputValue({ timeout: INPUT_TIMEOUT })
    .then((value) => value.trim())
    .catch(() => "");
}

export async function extractManualHoldingReferences(
  page: Page,
  expectedAccountMfId: string,
): Promise<ManualHoldingReference[]> {
  const pageAccountIdInputs = page.locator(
    'input[name="account[id_hash]"], input[name="rollover_info[account_id_hash]"]',
  );
  const pageAccountIds = await pageAccountIdInputs.evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value),
  );
  if (!pageAccountIds.includes(expectedAccountMfId)) return [];

  const rows = page.locator("table.table-pns tbody tr");
  const rowCount = await rows.count();
  const references: ManualHoldingReference[] = [];

  for (let index = 0; index < rowCount; index++) {
    const row = rows.nth(index);
    const [holdingMfId, subAccountMfId] = await Promise.all([
      getInputValue(row, "user_asset_det[id]"),
      getInputValue(row, "user_asset_det[sub_account_id_hash]"),
    ]);

    if (!holdingMfId || !subAccountMfId) continue;
    references.push({ holdingMfId, subAccountMfId, accountMfId: expectedAccountMfId });
  }

  return references;
}

export function buildUniqueManualHoldingAccountMap(
  references: readonly ManualHoldingReference[],
): ManualHoldingAccountMap {
  const candidatesByHolding = new Map<string, Set<string>>();

  for (const reference of references) {
    const key = createManualHoldingKey(reference.holdingMfId, reference.subAccountMfId);
    const candidates = candidatesByHolding.get(key) ?? new Set<string>();
    candidates.add(reference.accountMfId);
    candidatesByHolding.set(key, candidates);
  }

  const uniqueAccounts = new Map<string, string>();
  for (const [key, candidates] of candidatesByHolding) {
    if (candidates.size !== 1) continue;
    uniqueAccounts.set(key, [...candidates][0]);
  }
  return uniqueAccounts;
}

export async function getManualHoldingAccountMap(
  page: Page,
  registeredAccounts: RegisteredAccounts,
): Promise<ManualHoldingAccountMap> {
  const manualAccounts = registeredAccounts.accounts.filter(
    (account) => account.type === "手動" && extractManualAccountMfId(account.url) === account.mfId,
  );
  const references: ManualHoldingReference[] = [];
  let skippedPageCount = 0;

  for (const account of manualAccounts) {
    const expectedPath = `/accounts/show_manual/${encodeURIComponent(account.mfId)}`;
    try {
      const response = await page.goto(mfUrls.accountDetail(account.mfId, "show_manual"), {
        waitUntil: "domcontentloaded",
      });
      if (!response?.ok() || new URL(page.url()).pathname !== expectedPath) {
        skippedPageCount++;
        continue;
      }
      references.push(...(await extractManualHoldingReferences(page, account.mfId)));
    } catch {
      skippedPageCount++;
    }
  }

  const result = buildUniqueManualHoldingAccountMap(references);
  debug(
    `Manual holding account map: ${result.size} unique references from ${manualAccounts.length} current accounts`,
  );
  if (skippedPageCount > 0) {
    warn(`Skipped ${skippedPageCount} manual account detail pages`);
  }
  return result;
}
