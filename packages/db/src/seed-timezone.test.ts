import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";

describe.each(["UTC", "America/Los_Angeles"])("demo seed in %s", (timezone) => {
  it("keeps the fixed snapshot date", async () => {
    const debugDirectory = join(import.meta.dirname, "..", "debug");
    mkdirSync(debugDirectory, { recursive: true });
    const directory = mkdtempSync(join(debugDirectory, "seed-timezone-"));
    const databasePath = join(directory, "demo.db");

    try {
      execFileSync("pnpm", ["exec", "tsx", "src/seed.ts", "--period=2026-07"], {
        cwd: join(import.meta.dirname, ".."),
        env: { ...process.env, DB_PATH: databasePath, TZ: timezone },
        stdio: "ignore",
      });

      const client = createClient({ url: `file:${databasePath}` });
      try {
        const result = await client.execute(
          "SELECT DISTINCT date FROM daily_snapshots ORDER BY date",
        );
        expect(result.rows.map((row) => row.date)).toEqual(["2026-07-24"]);
      } finally {
        client.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
