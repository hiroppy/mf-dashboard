import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  CategoryDecisionConfig,
  CategoryRuleConfig,
  NormalizedCategoryDecisionConfig,
} from "./types.js";

const DEFAULT_MAX_PER_RUN = 5;
const DEFAULT_MIN_CONFIDENCE = 0.65;

export interface CategoryDecisionConfigLoadResult {
  enabled: boolean;
  config: NormalizedCategoryDecisionConfig | null;
}

function getDefaultCategoryRulesPath(): string {
  return path.resolve(import.meta.dirname, "../../../../data/category-rules.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseContains(value: unknown): string | string[] | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }
  return null;
}

function parseRules(value: unknown): CategoryRuleConfig[] {
  if (!Array.isArray(value)) return [];

  const rules: CategoryRuleConfig[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;

    const contains = parseContains(item.contains);
    if (contains && typeof item.category === "string" && typeof item.subCategory === "string") {
      rules.push({
        contains,
        category: item.category,
        subCategory: item.subCategory,
      });
    }
  }
  return rules;
}

function positiveNumberOrDefault(value: unknown, defaultValue: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : defaultValue;
}

function confidenceOrDefault(value: unknown, defaultValue: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : defaultValue;
}

function normalizeCategoryDecisionConfig(
  rawConfig: CategoryDecisionConfig,
): NormalizedCategoryDecisionConfig {
  return {
    llm: {
      enabled: rawConfig.llm?.enabled === true,
      maxPerRun: positiveNumberOrDefault(rawConfig.llm?.maxPerRun, DEFAULT_MAX_PER_RUN),
      minConfidence: confidenceOrDefault(rawConfig.llm?.minConfidence, DEFAULT_MIN_CONFIDENCE),
    },
    rules: parseRules(rawConfig.rules),
  };
}

export async function loadCategoryDecisionConfig(
  filePath = getDefaultCategoryRulesPath(),
  warn: (...args: unknown[]) => void = () => {},
): Promise<CategoryDecisionConfigLoadResult> {
  if (!existsSync(filePath)) {
    return { enabled: false, config: null };
  }

  try {
    const json = await readFile(filePath, "utf8");
    const parsed = JSON.parse(json) as CategoryDecisionConfig;
    return {
      enabled: true,
      config: normalizeCategoryDecisionConfig(parsed),
    };
  } catch (err) {
    warn(`Failed to load category rules from ${filePath}:`, err);
    return { enabled: false, config: null };
  }
}
