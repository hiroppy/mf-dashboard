import { existsSync } from "node:fs";
import { join } from "node:path";

export function getDbPath(): string {
  if (process.env.DB_PATH) {
    return process.env.DB_PATH;
  }

  const cwdDataDir = join(process.cwd(), "data");
  if (existsSync(cwdDataDir)) {
    return join(cwdDataDir, "moneyforward.db");
  }

  const rootDataDir = join(process.cwd(), "..", "..", "data");
  if (existsSync(rootDataDir)) {
    return join(rootDataDir, "moneyforward.db");
  }

  return join(cwdDataDir, "moneyforward.db");
}
