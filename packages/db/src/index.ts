import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as schema from "./schema/schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sqlite: Database.Database | null = null;

function getDbPath() {
  if (process.env.DB_PATH) {
    return process.env.DB_PATH;
  }
  // Try cwd first, then try going up directories
  const cwdDataDir = join(process.cwd(), "data");
  if (existsSync(cwdDataDir)) {
    return join(cwdDataDir, "moneyforward.db");
  }
  // apps/web or apps/crawler -> monorepo root
  const rootDataDir = join(process.cwd(), "..", "..", "data");
  if (existsSync(rootDataDir)) {
    return join(rootDataDir, "moneyforward.db");
  }
  return join(cwdDataDir, "moneyforward.db");
}

export function isDatabaseAvailable(): boolean {
  return existsSync(getDbPath());
}

export function getDb() {
  if (!_db) {
    _sqlite = new Database(getDbPath());
    _sqlite.pragma("journal_mode = WAL");
    _db = drizzle(_sqlite, { schema });
  }
  return _db;
}

export function closeDb() {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
}

export type Db = ReturnType<typeof getDb>;

export function initDb() {
  const db = getDb();

  // Apply migrations
  migrate(db, { migrationsFolder: join(import.meta.dirname, "../drizzle") });

  return db;
}

export { schema };

// Shared utilities
export * from "./shared/group-filter";
export * from "./shared/transfer";
export * from "./shared/utils";

// Query modules
export * from "./queries/groups";
export * from "./queries/transaction";
export * from "./queries/summary";
export * from "./queries/account";
export * from "./queries/asset";
export * from "./queries/holding";
export * from "./queries/analytics";
