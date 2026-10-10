import type { Locator, Page } from "playwright";

export interface HoldingAccountReference {
  fingerprint: string;
  accountMfId: string;
}

export interface HoldingAccountSource {
  complete: boolean;
  references: readonly HoldingAccountReference[];
}

const TABLE_SELECTOR = "table.table-depo, table.table-eq, table.table-mf, table.table-fx";

export function createHoldingAccountFingerprint(
  tableClass: string,
  headers: readonly string[],
  cells: readonly string[],
): string | null {
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
  const kind = tableClass
    .split(/\s+/)
    .find((name) => ["table-depo", "table-eq", "table-mf", "table-fx"].includes(name));
  let core: string[];
  if (kind === "table-depo") {
    const labels = headers.map(normalize);
    const name = labels.findIndex((label) => ["種類・名称", "名称"].includes(label));
    const balance = labels.indexOf("残高");
    if (name < 0 || balance < 0 || cells[name] === undefined || cells[balance] === undefined) {
      return null;
    }
    core = [cells[name]!, cells[balance]!];
  } else {
    // The detail page omits the institution column; stock details append a date.
    const count = kind === "table-eq" ? 9 : kind === "table-mf" ? 8 : kind === "table-fx" ? 5 : 0;
    if (!count || cells.length < count) return null;
    core = cells.slice(0, count);
  }
  core = core.map(normalize);
  if (!core[0] || core.every((value) => !value)) return null;
  return JSON.stringify([kind, ...core]);
}

export function buildHoldingAccountMap(
  globalFingerprints: readonly string[],
  source?: HoldingAccountSource,
): ReadonlyMap<string, string> {
  if (!source?.complete) return new Map();
  const globalCounts = new Map<string, number>();
  for (const key of globalFingerprints) globalCounts.set(key, (globalCounts.get(key) ?? 0) + 1);
  const candidates = new Map<string, { count: number; accounts: Set<string> }>();
  for (const { fingerprint, accountMfId } of source.references) {
    const candidate = candidates.get(fingerprint) ?? { count: 0, accounts: new Set<string>() };
    candidate.count++;
    candidate.accounts.add(accountMfId);
    candidates.set(fingerprint, candidate);
  }
  const result = new Map<string, string>();
  for (const [key, candidate] of candidates) {
    if (candidate.count !== globalCounts.get(key) || candidate.accounts.size !== 1) continue;
    const accountMfId = [...candidate.accounts][0];
    if (accountMfId) result.set(key, accountMfId);
  }
  return result;
}

export async function readHoldingAccountFingerprints(page: Page): Promise<string[]> {
  const rows = await page.locator(TABLE_SELECTOR).evaluateAll((tables) =>
    tables.flatMap((table) => {
      const headers = [...table.querySelectorAll("thead th")].map((cell) => cell.textContent ?? "");
      return [...table.querySelectorAll("tbody tr")].map((row) => ({
        tableClass: table.className,
        headers,
        cells: [...row.querySelectorAll(":scope > td")].map((cell) => cell.textContent ?? ""),
      }));
    }),
  );
  return rows.flatMap(({ tableClass, headers, cells }) => {
    const key = createHoldingAccountFingerprint(tableClass, headers, cells);
    return key ? [key] : [];
  });
}

export async function getHoldingAccountMfId(
  row: Locator,
  accountMap: ReadonlyMap<string, string>,
): Promise<string | null> {
  if (accountMap.size === 0) return null;
  const data = await row.evaluate((element) => {
    const table = element.closest("table");
    return {
      tableClass: table?.className ?? "",
      headers: [...(table?.querySelectorAll("thead th") ?? [])].map(
        (cell) => cell.textContent ?? "",
      ),
      cells: [...element.querySelectorAll(":scope > td")].map((cell) => cell.textContent ?? ""),
    };
  });
  const key = createHoldingAccountFingerprint(data.tableClass, data.headers, data.cells);
  return key ? (accountMap.get(key) ?? null) : null;
}
