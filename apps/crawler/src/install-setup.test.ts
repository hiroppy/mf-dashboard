import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

type RootPackageJson = {
  scripts?: Record<string, string>;
};

describe("root install setup", () => {
  test("installs Playwright browsers for the crawler after root install", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
    ) as RootPackageJson;

    expect(packageJson.scripts).toMatchObject({
      postinstall: "pnpm --filter @mf-dashboard/crawler exec playwright install",
    });
  });
});
