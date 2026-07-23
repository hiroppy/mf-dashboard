import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb, type Db } from "../index";

const APPLICATION_TABLES = [
  "account_statuses",
  "accounts",
  "analytics_reports",
  "asset_categories",
  "asset_history",
  "asset_history_categories",
  "daily_snapshots",
  "group_accounts",
  "groups",
  "holding_values",
  "holdings",
  "institution_categories",
  "spending_targets",
  "transactions",
] as const;

const DEMO_FIXTURE_FINGERPRINT = "a5983439e7cab409efe707937f3d0357116804251502197146d0ec636283c98c";

interface TableColumn {
  name: string;
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

/** Returns a deterministic digest of every application row in the demo fixture. */
export async function getDemoFixtureFingerprint(db: Db = getDb()) {
  const hash = createHash("sha256");

  for (const table of APPLICATION_TABLES) {
    const columns = await db.all<TableColumn>(
      sql.raw(`PRAGMA table_info(${quoteIdentifier(table)})`),
    );
    if (columns.length === 0) {
      throw new Error(`Demo fixture table is missing: ${table}`);
    }

    const columnNames = columns.map(({ name }) => name);
    const orderBy = columnNames.map(quoteIdentifier).join(", ");
    const rows = await db.all<Record<string, unknown>>(
      sql.raw(`SELECT * FROM ${quoteIdentifier(table)} ORDER BY ${orderBy}`),
    );

    hash.update(JSON.stringify({ columns: columnNames, rows, table }));
  }

  return hash.digest("hex");
}

export async function matchesDemoFixtureFingerprint(expectedFingerprint: string, db: Db = getDb()) {
  return (await getDemoFixtureFingerprint(db)) === expectedFingerprint;
}

export async function isDemoFixtureDatabase(db: Db = getDb()) {
  return matchesDemoFixtureFingerprint(DEMO_FIXTURE_FINGERPRINT, db);
}
