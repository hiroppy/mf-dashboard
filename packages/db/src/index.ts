import { existsSync } from "node:fs";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { getDbPath } from "./db-path";
import * as schema from "./schema/schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _client: Client | null = null;

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
export type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbExecutor = Db | DbTransaction;

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
