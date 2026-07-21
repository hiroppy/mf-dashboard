import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

type RootPackageJson = {
  scripts?: Record<string, string>;
};

describe("root install setup", () => {
  test("allows CI to skip the Playwright browser install", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
    ) as RootPackageJson;

    expect(packageJson.scripts).toMatchObject({
      postinstall:
        '[ -n "$SKIP_PLAYWRIGHT_BROWSER_INSTALL" ] || pnpm --filter @mf-dashboard/crawler exec playwright install',
    });
  });
});
