import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { loadCategoryDecisionConfig } from "./config.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = join(tmpdir(), `category-rules-${crypto.randomUUID()}`);
  await mkdir(tempDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("loadCategoryDecisionConfig", () => {
  test("設定ファイルが存在しない場合は無効として扱う", async () => {
    const result = await loadCategoryDecisionConfig(join(tempDir, "category-rules.json"));

    expect(result.enabled).toBe(false);
    expect(result.config).toBeNull();
  });

  test("設定ファイルが存在する場合はLLM defaultを補完して読み込む", async () => {
    const configPath = join(tempDir, "category-rules.json");
    await writeFile(
      configPath,
      JSON.stringify({
        llm: { enabled: true },
        rules: [{ contains: "Service A", category: "食費", subCategory: "食料品" }],
      }),
    );

    const result = await loadCategoryDecisionConfig(configPath);

    expect(result.enabled).toBe(true);
    expect(result.config).toEqual({
      llm: {
        enabled: true,
        maxPerRun: 5,
        minConfidence: 0.65,
      },
      rules: [{ contains: "Service A", category: "食費", subCategory: "食料品" }],
    });
  });

  test("不正なJSONでもcrawlerを落とさず無効化してwarnする", async () => {
    const warn = vi.fn<(...args: unknown[]) => void>();
    const configPath = join(tempDir, "category-rules.json");
    await writeFile(configPath, "{ invalid json");

    const result = await loadCategoryDecisionConfig(configPath, warn);

    expect(result.enabled).toBe(false);
    expect(result.config).toBeNull();
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls[0]?.[0]).toEqual(
      expect.stringContaining("Failed to load category rules"),
    );
  });

  test("空のcontainsを持つルールは無効化してwarnする", async () => {
    const warn = vi.fn<(...args: unknown[]) => void>();
    const configPath = join(tempDir, "category-rules.json");
    await writeFile(
      configPath,
      JSON.stringify({
        rules: [
          { contains: "", category: "食費", subCategory: "食料品" },
          { contains: "   ", category: "食費", subCategory: "食料品" },
          { contains: [], category: "食費", subCategory: "食料品" },
          { contains: ["Service A", ""], category: "食費", subCategory: "食料品" },
          { contains: "Service B", category: "食費", subCategory: "食料品" },
        ],
      }),
    );

    const result = await loadCategoryDecisionConfig(configPath, warn);

    expect(result.enabled).toBe(true);
    expect(result.config?.rules).toEqual([
      { contains: "Service B", category: "食費", subCategory: "食料品" },
    ]);
    expect(warn).toHaveBeenCalledTimes(4);
    expect(warn.mock.calls[0]?.[0]).toEqual(
      expect.stringContaining("Invalid category rule ignored"),
    );
  });
});
