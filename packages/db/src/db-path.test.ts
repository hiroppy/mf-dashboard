import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDbUrl } from "./db-path";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getDbUrl", () => {
  it.each(["#", "?"])("DB path内の%sをURL delimiterとして扱わない", (delimiter) => {
    const databasePath = resolve(`data/demo${delimiter}archive.db`);
    vi.stubEnv("DB_PATH", databasePath);

    expect(getDbUrl()).toBe(pathToFileURL(databasePath).href);
  });
});
