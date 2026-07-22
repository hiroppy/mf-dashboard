import { existsSync } from "node:fs";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema/schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _client: Client | null = null;

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
    _client = createClient({ url: `file:${getDbPath()}` });
    _db = drizzle(_client, { schema });
  }
  return _db;
}

export function closeDb() {
  if (_client) {
    _client.close();
    _client = null;
    _db = null;
  }
}

export type Db = LibSQLDatabase<typeof schema>;

export async function initDb() {
  const db = getDb();

  // Apply migrations
  await migrate(db, { migrationsFolder: join(import.meta.dirname, "../drizzle") });

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
