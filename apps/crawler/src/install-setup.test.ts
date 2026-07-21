import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

type RootPackageJson = {
  scripts?: Record<string, string>;
};

describe("root install setup", () => {
  let temporaryDirectory: string;
  let markerPath: string;
  let postinstall: string;

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "mf-dashboard-install-"));
    markerPath = path.join(temporaryDirectory, "pnpm-invocation");

    const packageJson = JSON.parse(
      readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
    ) as RootPackageJson;
    postinstall = packageJson.scripts?.postinstall ?? "";

    const fakePnpmPath = path.join(temporaryDirectory, "pnpm");
    writeFileSync(fakePnpmPath, '#!/bin/sh\nprintf "%s" "$*" > "$PLAYWRIGHT_TEST_MARKER"\n');
    chmodSync(fakePnpmPath, 0o755);
  });

  afterEach(() => {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  test("installs Playwright browsers by default", () => {
    const result = spawnSync("/bin/sh", ["-c", postinstall], {
      env: {
        PATH: temporaryDirectory,
        PLAYWRIGHT_TEST_MARKER: markerPath,
      },
    });

    expect(result.status).toBe(0);
    expect(readFileSync(markerPath, "utf8")).toBe(
      "--filter @mf-dashboard/crawler exec playwright install",
    );
  });

  test("skips Playwright browser installation when requested", () => {
    const result = spawnSync("/bin/sh", ["-c", postinstall], {
      env: {
        PATH: temporaryDirectory,
        PLAYWRIGHT_TEST_MARKER: markerPath,
        SKIP_PLAYWRIGHT_BROWSER_INSTALL: "true",
      },
    });

    expect(result.status).toBe(0);
    expect(existsSync(markerPath)).toBe(false);
  });
});
