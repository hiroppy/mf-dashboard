import { isAbsolute } from "node:path";

export function assertDatabasePathConfigured(environment: NodeJS.ProcessEnv = process.env) {
  const databasePath = environment.DB_PATH;

  if (!databasePath || databasePath !== databasePath.trim() || !isAbsolute(databasePath)) {
    throw new Error("DB_PATH is required and must be an absolute path");
  }
}
