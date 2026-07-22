import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, describe, expect, it } from "vitest";
import * as schema from "../schema/schema";
import { isDemoFixtureDatabase } from "./demo-fixture";

const temporaryDirectory = resolve(import.meta.dirname, ".demo-fixture-test");
const temporaryDatabase = resolve(temporaryDirectory, "demo.db");
const demoDatabase = resolve(import.meta.dirname, "../../../../data/demo.db");

describe("getDemoFixtureFingerprint", () => {
  let client: Client | undefined;

  afterEach(() => {
    client?.close();
    rmSync(temporaryDirectory, { force: true, recursive: true });
  });

  it("rejects the fixture when a holding changes", async () => {
    mkdirSync(temporaryDirectory);
    copyFileSync(demoDatabase, temporaryDatabase);
    client = createClient({ url: `file:${temporaryDatabase}` });
    const db = drizzle(client, { schema });
    await expect(isDemoFixtureDatabase(db)).resolves.toBe(true);
    const holding = await db
      .select({ id: schema.holdings.id })
      .from(schema.holdings)
      .limit(1)
      .get();

    expect(holding).toBeDefined();
    await db
      .update(schema.holdings)
      .set({ name: "改変されたデモ銘柄" })
      .where(eq(schema.holdings.id, holding!.id));

    await expect(isDemoFixtureDatabase(db)).resolves.toBe(false);
  });
});
